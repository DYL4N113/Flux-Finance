import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('SUPABASE ERROR: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing in Environment Variables.');
}

// Only initialize if we have the URL and Key to avoid "supabaseUrl is required" error
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null as any;

// Helper for Google Auth
export const signInWithGoogle = async () => {
  if (!supabase) {
    alert('Supabase belum terkonfigurasi. Silakan masukkan VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di Settings > Environment Variables.');
    return;
  }
  
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          prompt: 'select_account',
          access_type: 'offline',
        }
      },
    });
    
    if (error) throw error;
  } catch (err: any) {
    console.error('Supabase Auth Error:', err);
    throw err;
  }
};

export const signOut = async () => {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};
