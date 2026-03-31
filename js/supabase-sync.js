/**
 * Supabase cloud sync — best-effort sync of reading progress.
 * Local IDB is always the source of truth; cloud is supplementary.
 *
 * Supabase table expected:
 *   book_progress (
 *     id         uuid  default gen_random_uuid() primary key,
 *     user_id    uuid  references auth.users not null,
 *     book_id    text  not null,
 *     title      text,
 *     author     text,
 *     chapter    int4  default 0,
 *     chunk_index int4 default 0,
 *     total_chapters int4 default 1,
 *     last_read  bigint,
 *     updated_at timestamptz default now(),
 *     unique(user_id, book_id)
 *   )
 *   RLS: enable row-level security, policy: user_id = auth.uid()
 */
const SupabaseSync = (() => {
  // ── Placeholder config — fill in your Supabase project URL and anon key ──
  const SUPABASE_URL = 'https://ebihzaqncthtbrzhjnrg.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViaWh6YXFuY3RodGJyemhqbnJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NjEzMTYsImV4cCI6MjA5MDUzNzMxNn0.DGjPjTx8HkpHsterEnCdcudMg0A_VXehm0ZkYt6fZxo';

  let client = null;

  function init() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('SupabaseSync: No URL/key configured — cloud sync disabled.');
      return;
    }
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      console.warn('SupabaseSync: Supabase JS SDK not loaded.');
      return;
    }
    try {
      client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (err) {
      console.error('SupabaseSync: init failed', err);
    }
  }

  function isEnabled() {
    return !!client;
  }

  // ── Auth ──

  async function signUp(email, password) {
    if (!client) throw new Error('Cloud sync not configured');
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }

  async function signIn(email, password) {
    if (!client) throw new Error('Cloud sync not configured');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) console.warn('SupabaseSync: sign-out error', error);
  }

  function getUser() {
    if (!client) return null;
    try {
      return client.auth.getUser().then(({ data }) => data?.user ?? null);
    } catch {
      return Promise.resolve(null);
    }
  }

  function getSession() {
    if (!client) return Promise.resolve(null);
    return client.auth.getSession().then(({ data }) => data?.session ?? null).catch(() => null);
  }

  function onAuthChange(callback) {
    if (!client) return { data: { subscription: { unsubscribe() {} } } };
    return client.auth.onAuthStateChange((_event, session) => {
      callback(session?.user ?? null);
    });
  }

  // ── Progress sync ──

  async function pushProgress(bookId, data) {
    if (!client) return;
    const session = await getSession();
    if (!session) return;

    try {
      await client.from('book_progress').upsert({
        user_id: session.user.id,
        book_id: bookId,
        title: data.title || 'Unknown',
        author: data.author || 'Unknown',
        chapter: data.chapter ?? 0,
        chunk_index: data.chunkIndex ?? 0,
        total_chapters: data.totalChapters ?? 1,
        last_read: data.lastRead || Date.now(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,book_id' });
    } catch (err) {
      console.warn('SupabaseSync: pushProgress failed', err);
    }
  }

  async function pullProgress(bookId) {
    if (!client) return null;
    const session = await getSession();
    if (!session) return null;

    try {
      const { data, error } = await client
        .from('book_progress')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('book_id', bookId)
        .single();
      if (error || !data) return null;
      return {
        chapter: data.chapter,
        chunkIndex: data.chunk_index,
        totalChapters: data.total_chapters,
        lastRead: data.last_read,
        title: data.title,
        author: data.author
      };
    } catch (err) {
      console.warn('SupabaseSync: pullProgress failed', err);
      return null;
    }
  }

  async function pullAllProgress() {
    if (!client) return [];
    const session = await getSession();
    if (!session) return [];

    try {
      const { data, error } = await client
        .from('book_progress')
        .select('*')
        .eq('user_id', session.user.id);
      if (error || !data) return [];
      return data.map(row => ({
        id: row.book_id,
        chapter: row.chapter,
        chunkIndex: row.chunk_index,
        totalChapters: row.total_chapters,
        lastRead: row.last_read,
        title: row.title,
        author: row.author
      }));
    } catch (err) {
      console.warn('SupabaseSync: pullAllProgress failed', err);
      return [];
    }
  }

  return {
    init,
    isEnabled,
    signUp,
    signIn,
    signOut,
    getUser,
    getSession,
    onAuthChange,
    pushProgress,
    pullProgress,
    pullAllProgress
  };
})();
