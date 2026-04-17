import { NextRequest, NextResponse } from 'next/server';
import * as line from '@line/bot-sdk';
import { parseTaskAndTime, parseTimeOnly } from '@/lib/claude';
import {
  replyMessage,
  buildListFlex,
  buildReminderFlex,
  buildSnoozeFlex,
  buildActionMenuFlex,
  buildDeleteConfirmFlex,
  buildSetTimeQuickReply,
  textMsg,
} from '@/lib/line';
import {
  createTodo,
  listTodos,
  listAllTodos,
  completeTodo,
  updateTodoTime,
  updateTodoTask,
  deleteTodo,
  getTodo,
} from '@/lib/todos';
import { getState, setState, clearState } from '@/lib/state';

// ─── Signature verification ───────────────────────────────────

async function verifySignature(req: NextRequest, body: string): Promise<boolean> {
  const signature = req.headers.get('x-line-signature');
  if (!signature) return false;

  const secret = process.env.LINE_CHANNEL_SECRET!;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = Buffer.from(sig).toString('base64');
  return signature === expected;
}

// ─── Helpers ──────────────────────────────────────────────────

async function sendList(replyToken: string, userId: string) {
  const todos = await listTodos(userId, 10);
  const all = await listAllTodos(userId);
  const hasMore = all.length > 10;
  await replyMessage(replyToken, [buildListFlex(todos, hasMore)]);
}

function snoozeTime(option: string, baseRemindAt: string | null): string {
  const now = new Date();
  const base = baseRemindAt ? new Date(baseRemindAt) : now;

  switch (option) {
    case 'later3h': {
      const d = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      return d.toISOString();
    }
    case 'tomorrow': {
      const d = new Date(base);
      d.setDate(d.getDate() + 1);
      return d.toISOString();
    }
    case 'nextweek': {
      const d = new Date(base);
      d.setDate(d.getDate() + 7);
      return d.toISOString();
    }
    default:
      return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();
  }
}

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

function setTimeToday(baseTime: string | null): string {
  const taipeiNow = new Date(Date.now() + TAIPEI_OFFSET_MS);
  let hour = 9, min = 0;
  if (baseTime) {
    const taipeiBase = new Date(new Date(baseTime).getTime() + TAIPEI_OFFSET_MS);
    hour = taipeiBase.getUTCHours();
    min = taipeiBase.getUTCMinutes();
  }
  const utcMs = Date.UTC(
    taipeiNow.getUTCFullYear(), taipeiNow.getUTCMonth(), taipeiNow.getUTCDate(),
    hour, min, 0
  ) - TAIPEI_OFFSET_MS;
  return new Date(utcMs).toISOString();
}

// ─── Message event handler ────────────────────────────────────

async function handleMessage(event: line.webhook.MessageEvent) {
  if (event.message.type !== 'text') return;
  if (!event.source || !event.replyToken) return;
  const userId = event.source.userId;
  if (!userId) return;
  const replyToken = event.replyToken;
  const text = (event.message as { text: string }).text.trim();

  const stateRow = await getState(userId);

  // ── Multi-turn dialog states ──
  if (stateRow.state === 'awaiting_time' || stateRow.state === 'awaiting_new_time') {
    const todoId = stateRow.context?.todo_id;
    if (!todoId) { await clearState(userId); return; }

    const time = await parseTimeOnly(text);
    if (!time) {
      await replyMessage(replyToken, [textMsg('無法解析時間，請再試一次（例如：明天下午3點）')]);
      return;
    }
    await updateTodoTime(todoId, time);
    await clearState(userId);
    await sendList(replyToken, userId);
    return;
  }

  if (stateRow.state === 'awaiting_new_task') {
    const todoId = stateRow.context?.todo_id;
    if (!todoId) { await clearState(userId); return; }

    await updateTodoTask(todoId, text);
    await clearState(userId);
    await sendList(replyToken, userId);
    return;
  }

  if (stateRow.state === 'awaiting_snooze_time') {
    const todoId = stateRow.context?.todo_id;
    if (!todoId) { await clearState(userId); return; }

    const time = await parseTimeOnly(text);
    if (!time) {
      await replyMessage(replyToken, [textMsg('無法解析時間，請再試一次')]);
      return;
    }
    await updateTodoTime(todoId, time);
    await clearState(userId);
    await sendList(replyToken, userId);
    return;
  }

  // ── Keyword commands ──
  const keywords = ['清單', '我的待辦', '待辦清單', 'list', 'todo'];
  if (keywords.some((k) => text.includes(k))) {
    await sendList(replyToken, userId);
    return;
  }

  // ── New todo (default: idle state) ──
  const parsed = await parseTaskAndTime(text);
  const todo = await createTodo(userId, parsed.task, parsed.remind_at);

  if (parsed.remind_at) {
    await sendList(replyToken, userId);
  } else {
    // No time detected — show list + quick reply to set time
    const todos = await listTodos(userId, 10);
    const all = await listAllTodos(userId);
    const hasMore = all.length > 10;
    await replyMessage(replyToken, [
      textMsg(`✅ 已記錄：${todo.task}\n\n要設定提醒時間嗎？`),
      {
        ...buildListFlex(todos, hasMore),
        quickReply: buildSetTimeQuickReply(todo.id),
      } as line.messagingApi.FlexMessage,
    ]);

    // Set state to awaiting_time so the next message sets the time
    await setState(userId, 'awaiting_time', { todo_id: todo.id });
  }
}

// ─── Postback event handler ───────────────────────────────────

async function handlePostback(event: line.webhook.PostbackEvent) {
  if (!event.source || !event.replyToken) return;
  const userId = event.source.userId;
  if (!userId) return;
  const replyToken = event.replyToken;
  const params = new URLSearchParams(event.postback.data);
  const action = params.get('action');
  const todoId = params.get('todo_id') ?? undefined;

  // Helper to assert todoId is defined (already guarded by `if (!todoId) break`)
  const id = (tid: string | undefined): string => tid!;

  switch (action) {
    case 'complete': {
      if (!todoId) break;
      const todo = await getTodo(todoId);
      if (!todo) break;
      await completeTodo(todoId);
      await clearState(userId);
      const todos = await listTodos(userId, 10);
      const all = await listAllTodos(userId);
      await replyMessage(replyToken, [
        textMsg(`✅ 已完成：${todo.task}`),
        buildListFlex(todos, all.length > 10),
      ]);
      break;
    }

    case 'snooze': {
      if (!todoId) break;
      const todo = await getTodo(todoId);
      await replyMessage(replyToken, [buildSnoozeFlex(todoId, todo?.remind_at)]);
      break;
    }

    case 'snooze_later3h':
    case 'snooze_tomorrow':
    case 'snooze_nextweek': {
      if (!todoId) break;
      const todo = await getTodo(todoId);
      if (!todo) break;
      const option = action.replace('snooze_', '');
      const newTime = snoozeTime(option, todo.remind_at);
      await updateTodoTime(todoId, newTime);
      await clearState(userId);
      await sendList(replyToken, userId);
      break;
    }

    case 'snooze_custom': {
      if (!todoId) break;
      await setState(userId, 'awaiting_snooze_time', { todo_id: todoId });
      await replyMessage(replyToken, [textMsg('請輸入新的提醒時間（例如：明天下午3點）')]);
      break;
    }

    case 'view_list':
    case 'cancel': {
      await clearState(userId);
      await sendList(replyToken, userId);
      break;
    }

    case 'view_all': {
      const todos = await listAllTodos(userId);
      await replyMessage(replyToken, [buildListFlex(todos, false)]);
      break;
    }

    case 'menu': {
      if (!todoId) break;
      const todo = await getTodo(todoId);
      if (!todo) break;
      await replyMessage(replyToken, [buildActionMenuFlex(todo)]);
      break;
    }

    case 'edit_time': {
      if (!todoId) break;
      await setState(userId, 'awaiting_new_time', { todo_id: todoId });
      await replyMessage(replyToken, [textMsg('請輸入新的提醒時間（例如：下週五早上10點）')]);
      break;
    }

    case 'edit_task': {
      if (!todoId) break;
      await setState(userId, 'awaiting_new_task', { todo_id: todoId });
      await replyMessage(replyToken, [textMsg('請輸入新的待辦內容')]);
      break;
    }

    case 'delete': {
      if (!todoId) break;
      const todo = await getTodo(todoId);
      if (!todo) break;
      await replyMessage(replyToken, [buildDeleteConfirmFlex(todo)]);
      break;
    }

    case 'delete_confirm': {
      if (!todoId) break;
      const todo = await getTodo(todoId);
      if (!todo) break;
      await deleteTodo(todoId);
      await clearState(userId);
      const todos = await listTodos(userId, 10);
      const all = await listAllTodos(userId);
      await replyMessage(replyToken, [
        textMsg(`🗑️ 已刪除：${todo.task}`),
        buildListFlex(todos, all.length > 10),
      ]);
      break;
    }

    // Quick reply: set time for new todo
    case 'set_time_today': {
      if (!todoId) break;
      const todo = await getTodo(todoId);
      const newTime = setTimeToday(todo?.remind_at ?? null);
      await updateTodoTime(todoId, newTime);
      await clearState(userId);
      await sendList(replyToken, userId);
      break;
    }
    case 'set_time_tomorrow': {
      if (!todoId) break;
      const todo = await getTodo(todoId);
      const newTime = snoozeTime('tomorrow', todo?.remind_at ?? null);
      await updateTodoTime(todoId, newTime);
      await clearState(userId);
      await sendList(replyToken, userId);
      break;
    }
    case 'set_time_nextweek': {
      if (!todoId) break;
      const todo = await getTodo(todoId);
      const newTime = snoozeTime('nextweek', todo?.remind_at ?? null);
      await updateTodoTime(todoId, newTime);
      await clearState(userId);
      await sendList(replyToken, userId);
      break;
    }

    case 'pick_time':
    case 'snooze_pick': {
      if (!todoId) break;
      const postback = event.postback as { data: string; params?: { datetime?: string } };
      const datetimeStr = postback.params?.datetime;
      if (!datetimeStr) break;
      const isoTime = `${datetimeStr}:00+08:00`;
      await updateTodoTime(todoId, isoTime);
      await clearState(userId);
      await sendList(replyToken, userId);
      break;
    }
  }
}

// ─── Route handler ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.text();

  const valid = await verifySignature(req, body);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(body) as line.webhook.CallbackRequest;

  await Promise.all(
    payload.events.map(async (event) => {
      try {
        if (event.type === 'message') {
          await handleMessage(event as line.webhook.MessageEvent);
        } else if (event.type === 'postback') {
          await handlePostback(event as line.webhook.PostbackEvent);
        }
      } catch (err) {
        console.error('Event handling error:', err);
      }
    })
  );

  return NextResponse.json({ ok: true });
}
