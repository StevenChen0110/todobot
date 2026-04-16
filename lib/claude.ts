import Anthropic from '@anthropic-ai/sdk';
import type { ParsedTask } from '@/types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

export async function parseTaskAndTime(userMessage: string): Promise<ParsedTask> {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const today = now.toISOString().split('T')[0];
  const weekday = WEEKDAYS[now.getDay()];

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: `Today is ${today} (${weekday}), timezone Asia/Taipei (UTC+8).

Parse the user's Chinese message and extract:
- task: the todo content (remove time expressions, keep only the task description)
- remind_at: the reminder datetime in ISO 8601 format with +08:00 offset, or null if no time is mentioned

Rules:
- "今天" = ${today}
- "明天" = tomorrow
- "後天" = day after tomorrow
- "下週X" = next week's X (下週一=Monday, 下週五=Friday, etc.)
- "這週X" = this week's X
- If only a date is given (no time), default to 09:00:00+08:00
- If time is mentioned (e.g. 下午3點, 早上9點), use that time

Respond with JSON only, no markdown:
{"task": "string", "remind_at": "ISO8601 string or null"}`,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';

  try {
    const parsed = JSON.parse(text.trim()) as ParsedTask;
    return {
      task: parsed.task || userMessage,
      remind_at: parsed.remind_at || null,
    };
  } catch {
    return { task: userMessage, remind_at: null };
  }
}

export async function parseTimeOnly(userMessage: string, baseDatetime?: string): Promise<string | null> {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const today = now.toISOString().split('T')[0];
  const weekday = WEEKDAYS[now.getDay()];
  const base = baseDatetime ? `Base datetime: ${baseDatetime}` : '';

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 128,
    system: `Today is ${today} (${weekday}), timezone Asia/Taipei (UTC+8). ${base}

Parse the user's message as a datetime for a reminder.
Respond with a single ISO 8601 datetime string with +08:00 offset, or "null" if unparseable.
No markdown, no explanation, just the datetime string or "null".`,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : 'null';
  return text === 'null' ? null : text;
}
