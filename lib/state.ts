import { supabase } from './supabase';
import type { ConversationState, ConversationStateRow } from '@/types';

export async function getState(userId: string): Promise<ConversationStateRow> {
  const { data } = await supabase
    .from('conversation_states')
    .select('*')
    .eq('user_id', userId)
    .single();

  return (data as ConversationStateRow) ?? {
    user_id: userId,
    state: 'idle',
    context: null,
    updated_at: new Date().toISOString(),
  };
}

export async function setState(
  userId: string,
  state: ConversationState,
  context: { todo_id?: string } | null = null
): Promise<void> {
  await supabase.from('conversation_states').upsert({
    user_id: userId,
    state,
    context,
  });
}

export async function clearState(userId: string): Promise<void> {
  await setState(userId, 'idle', null);
}
