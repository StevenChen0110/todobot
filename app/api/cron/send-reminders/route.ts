import { NextRequest, NextResponse } from 'next/server';
import { getDueTodos, markReminded } from '@/lib/todos';
import { pushMessage, buildReminderFlex } from '@/lib/line';

export async function GET(req: NextRequest) {
  // Protect this endpoint
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dueTodos = await getDueTodos();

  const results = await Promise.allSettled(
    dueTodos.map(async (todo) => {
      await pushMessage(todo.user_id, [buildReminderFlex(todo)]);
      await markReminded(todo.id);
      return todo.id;
    })
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  console.log(`[cron] sent=${sent} failed=${failed}`);
  return NextResponse.json({ sent, failed });
}
