import * as line from '@line/bot-sdk';
import type { Todo } from '@/types';

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

// ─── Send helpers ────────────────────────────────────────────

export async function replyMessage(replyToken: string, messages: line.messagingApi.Message[]): Promise<void> {
  await client.replyMessage({ replyToken, messages });
}

export async function pushMessage(userId: string, messages: line.messagingApi.Message[]): Promise<void> {
  await client.pushMessage({ to: userId, messages });
}

// ─── Date formatting ─────────────────────────────────────────

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  // Show time only if it's not 09:00 (the default)
  if (hour === '09' && min === '00') return `${month}/${day}`;
  return `${month}/${day} ${hour}:${min}`;
}

// ─── Flex Message: Todo list ──────────────────────────────────

export function buildListFlex(todos: Todo[], hasMore = false): line.messagingApi.FlexMessage {
  const rows: line.messagingApi.FlexComponent[] = todos.map((todo) => ({
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    paddingTop: '8px',
    paddingBottom: '8px',
    contents: [
      {
        type: 'text',
        text: '☐',
        size: 'sm',
        color: '#888888',
        flex: 0,
        gravity: 'center',
      },
      {
        type: 'text',
        text: todo.task,
        size: 'sm',
        flex: 3,
        wrap: true,
        gravity: 'center',
      },
      {
        type: 'text',
        text: todo.remind_at ? formatDate(todo.remind_at) : '未設時間',
        size: 'xs',
        color: todo.remind_at ? '#555555' : '#BBBBBB',
        flex: 2,
        align: 'end',
        gravity: 'center',
      },
      {
        type: 'button',
        action: {
          type: 'postback',
          label: '⋯',
          data: `action=menu&todo_id=${todo.id}`,
          displayText: '操作',
        },
        style: 'link',
        height: 'sm',
        flex: 0,
      },
    ],
  }));

  const footer: line.messagingApi.FlexComponent[] = hasMore
    ? [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '查看全部待辦',
            data: 'action=view_all',
            displayText: '查看全部待辦',
          },
          style: 'link',
          height: 'sm',
          color: '#1DB446',
        },
      ]
    : [];

  const bubble: line.messagingApi.FlexBubble = {
    type: 'bubble',
    size: 'giga',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: `📋 待辦清單（${todos.length} 筆）`,
          weight: 'bold',
          size: 'md',
        },
      ],
      paddingAll: '16px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'none',
      contents:
        todos.length === 0
          ? [
              {
                type: 'text',
                text: '目前沒有待辦事項 🎉',
                color: '#888888',
                align: 'center',
                margin: 'md',
              },
            ]
          : rows,
      paddingAll: '12px',
    },
    ...(footer.length > 0 && {
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: footer,
        paddingAll: '8px',
      },
    }),
  };

  return {
    type: 'flex',
    altText: `待辦清單（${todos.length} 筆）`,
    contents: bubble,
  };
}

// ─── Flex Message: Reminder ───────────────────────────────────

export function buildReminderFlex(todo: Todo): line.messagingApi.FlexMessage {
  const bubble: line.messagingApi.FlexBubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#1DB446',
      contents: [
        {
          type: 'text',
          text: '⏰ 待辦提醒',
          weight: 'bold',
          color: '#FFFFFF',
          size: 'md',
        },
      ],
      paddingAll: '16px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: todo.task,
          size: 'md',
          wrap: true,
          weight: 'bold',
        },
      ],
      paddingAll: '16px',
    },
    footer: {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '✅ 完成',
            data: `action=complete&todo_id=${todo.id}`,
            displayText: '完成',
          },
          style: 'primary',
          color: '#1DB446',
          flex: 1,
        },
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '⏰ 延後',
            data: `action=snooze&todo_id=${todo.id}`,
            displayText: '延後',
          },
          style: 'secondary',
          flex: 1,
        },
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '📋 清單',
            data: 'action=view_list',
            displayText: '看清單',
          },
          style: 'link',
          flex: 1,
        },
      ],
      paddingAll: '12px',
    },
  };

  return {
    type: 'flex',
    altText: `⏰ 提醒：${todo.task}`,
    contents: bubble,
  };
}

// ─── Flex Message: Snooze options ────────────────────────────

export function buildSnoozeFlex(todoId: string): line.messagingApi.FlexMessage {
  const bubble: line.messagingApi.FlexBubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'text',
          text: '延後到什麼時候？',
          weight: 'bold',
          size: 'md',
          margin: 'md',
        },
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '今天晚點（+3 小時）',
            data: `action=snooze_later3h&todo_id=${todoId}`,
            displayText: '今天晚點',
          },
          style: 'secondary',
          margin: 'md',
        },
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '明天',
            data: `action=snooze_tomorrow&todo_id=${todoId}`,
            displayText: '明天',
          },
          style: 'secondary',
        },
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '下週',
            data: `action=snooze_nextweek&todo_id=${todoId}`,
            displayText: '下週',
          },
          style: 'secondary',
        },
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '自訂時間',
            data: `action=snooze_custom&todo_id=${todoId}`,
            displayText: '自訂時間',
          },
          style: 'link',
        },
      ],
      paddingAll: '16px',
    },
  };

  return {
    type: 'flex',
    altText: '延後選項',
    contents: bubble,
  };
}

// ─── Flex Message: Todo action menu ──────────────────────────

export function buildActionMenuFlex(todo: Todo): line.messagingApi.FlexMessage {
  const bubble: line.messagingApi.FlexBubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'text',
          text: todo.task,
          weight: 'bold',
          size: 'sm',
          wrap: true,
          color: '#555555',
          margin: 'md',
        },
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '✅ 標記完成',
            data: `action=complete&todo_id=${todo.id}`,
            displayText: '完成',
          },
          style: 'primary',
          color: '#1DB446',
          margin: 'md',
        },
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '🕐 改時間',
            data: `action=edit_time&todo_id=${todo.id}`,
            displayText: '改時間',
          },
          style: 'secondary',
        },
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '✏️ 改內容',
            data: `action=edit_task&todo_id=${todo.id}`,
            displayText: '改內容',
          },
          style: 'secondary',
        },
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '🗑️ 刪除',
            data: `action=delete&todo_id=${todo.id}`,
            displayText: '刪除',
          },
          style: 'link',
          color: '#E53935',
        },
      ],
      paddingAll: '16px',
    },
  };

  return {
    type: 'flex',
    altText: '操作選單',
    contents: bubble,
  };
}

// ─── Flex Message: Delete confirm ────────────────────────────

export function buildDeleteConfirmFlex(todo: Todo): line.messagingApi.FlexMessage {
  const bubble: line.messagingApi.FlexBubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'text',
          text: '確定刪除這筆待辦？',
          weight: 'bold',
          size: 'md',
          margin: 'md',
        },
        {
          type: 'text',
          text: todo.task,
          size: 'sm',
          color: '#888888',
          wrap: true,
        },
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          margin: 'lg',
          contents: [
            {
              type: 'button',
              action: {
                type: 'postback',
                label: '確定刪除',
                data: `action=delete_confirm&todo_id=${todo.id}`,
                displayText: '確定刪除',
              },
              style: 'primary',
              color: '#E53935',
              flex: 1,
            },
            {
              type: 'button',
              action: {
                type: 'postback',
                label: '取消',
                data: 'action=view_list',
                displayText: '取消',
              },
              style: 'secondary',
              flex: 1,
            },
          ],
        },
      ],
      paddingAll: '16px',
    },
  };

  return {
    type: 'flex',
    altText: '確定刪除？',
    contents: bubble,
  };
}

// ─── Quick Reply: Set time ────────────────────────────────────

export function buildSetTimeQuickReply(todoId: string): line.messagingApi.QuickReply {
  return {
    items: [
      {
        type: 'action',
        action: {
          type: 'postback',
          label: '今天',
          data: `action=set_time_today&todo_id=${todoId}`,
          displayText: '今天',
        },
      },
      {
        type: 'action',
        action: {
          type: 'postback',
          label: '明天',
          data: `action=set_time_tomorrow&todo_id=${todoId}`,
          displayText: '明天',
        },
      },
      {
        type: 'action',
        action: {
          type: 'postback',
          label: '下週',
          data: `action=set_time_nextweek&todo_id=${todoId}`,
          displayText: '下週',
        },
      },
    ],
  };
}

// ─── Simple text messages ─────────────────────────────────────

export function textMsg(text: string): line.messagingApi.TextMessage {
  return { type: 'text', text };
}
