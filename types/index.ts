export type Todo = {
  id: string;
  user_id: string;
  task: string;
  remind_at: string | null;
  completed: boolean;
  reminded: boolean;
  created_at: string;
  updated_at: string;
};

export type ConversationState =
  | 'idle'
  | 'awaiting_time'
  | 'awaiting_new_time'
  | 'awaiting_new_task'
  | 'awaiting_snooze_time';

export type ConversationStateRow = {
  user_id: string;
  state: ConversationState;
  context: { todo_id?: string } | null;
  updated_at: string;
};

export type ParsedTask = {
  task: string;
  remind_at: string | null;
};
