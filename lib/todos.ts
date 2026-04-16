import { supabase } from './supabase';
import type { Todo } from '@/types';

export async function createTodo(userId: string, task: string, remindAt: string | null): Promise<Todo> {
  const { data, error } = await supabase
    .from('todos')
    .insert({ user_id: userId, task, remind_at: remindAt })
    .select()
    .single();

  if (error) throw error;
  return data as Todo;
}

export async function listTodos(userId: string, limit = 10): Promise<Todo[]> {
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .eq('user_id', userId)
    .eq('completed', false)
    .order('remind_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as Todo[];
}

export async function listAllTodos(userId: string): Promise<Todo[]> {
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .eq('user_id', userId)
    .eq('completed', false)
    .order('remind_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Todo[];
}

export async function completeTodo(todoId: string): Promise<Todo> {
  const { data, error } = await supabase
    .from('todos')
    .update({ completed: true })
    .eq('id', todoId)
    .select()
    .single();

  if (error) throw error;
  return data as Todo;
}

export async function updateTodoTime(todoId: string, remindAt: string): Promise<Todo> {
  const { data, error } = await supabase
    .from('todos')
    .update({ remind_at: remindAt, reminded: false })
    .eq('id', todoId)
    .select()
    .single();

  if (error) throw error;
  return data as Todo;
}

export async function updateTodoTask(todoId: string, task: string): Promise<Todo> {
  const { data, error } = await supabase
    .from('todos')
    .update({ task })
    .eq('id', todoId)
    .select()
    .single();

  if (error) throw error;
  return data as Todo;
}

export async function deleteTodo(todoId: string): Promise<void> {
  const { error } = await supabase.from('todos').delete().eq('id', todoId);
  if (error) throw error;
}

export async function getTodo(todoId: string): Promise<Todo | null> {
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .eq('id', todoId)
    .single();

  if (error) return null;
  return data as Todo;
}

export async function getDueTodos(): Promise<Todo[]> {
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .lte('remind_at', new Date().toISOString())
    .eq('completed', false)
    .eq('reminded', false);

  if (error) throw error;
  return (data ?? []) as Todo[];
}

export async function markReminded(todoId: string): Promise<void> {
  const { error } = await supabase
    .from('todos')
    .update({ reminded: true })
    .eq('id', todoId);

  if (error) throw error;
}
