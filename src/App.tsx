/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, FormEvent, useMemo, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, Plus, ArrowUpRight, ArrowDownLeft, Wallet, History, User as UserIcon, AlertTriangle, TrendingUp, PieChart as PieIcon, BarChart3, LogOut, Chrome, CheckCircle, XCircle, Info, X } from 'lucide-react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line
} from 'recharts';
import { supabase, signInWithGoogle, signOut } from './lib/supabase';
import { User } from '@supabase/supabase-js';

interface Transaction {
  id: string;
  amount: number;
  category: string;
  type: 'income' | 'expense';
  description: string;
  date: number;
  user_id?: string;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ModalConfig {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  type: 'confirm' | 'alert';
}

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

const CATEGORIES = [
  { name: 'Makanan', emoji: '🍱', color: '#CCFF00' },
  { name: 'Transportasi', emoji: '🚗', color: '#00F0FF' },
  { name: 'Belanja', emoji: '🛍️', color: '#FF00E5' },
  { name: 'Hiburan', emoji: '🎮', color: '#9D00FF' },
  { name: 'Tagihan', emoji: '🔋', color: '#FFAC00' },
  { name: 'Kesehatan', emoji: '🩺', color: '#FF003D' },
  { name: 'Lainnya', emoji: '🧩', color: '#888888' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'account'>('home');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0].name);
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [description, setDescription] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modal, setModal] = useState<ModalConfig>({
    isOpen: false,
    title: '',
    message: '',
    type: 'alert'
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);

  // Toast Helper
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Modal Helper
  const showModal = (config: Omit<ModalConfig, 'isOpen'>) => {
    setModal({ ...config, isOpen: true });
  };

  const closeModal = () => setModal(prev => ({ ...prev, isOpen: false }));

  // Formatting helper
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val).replace('IDR', 'Rp');
  };

  const formatNumber = (val: number) => {
    return new Intl.NumberFormat('id-ID').format(val);
  };

  // Grouping logic for History page
  const groupedTransactions = useMemo(() => {
    const months: Record<string, any> = {};

    [...transactions].sort((a, b) => b.date - a.date).forEach(t => {
      const date = new Date(t.date);
      const monthYear = date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      const dayDate = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

      if (!months[monthYear]) {
        months[monthYear] = {
          label: monthYear,
          days: {}
        };
      }

      if (!months[monthYear].days[dayDate]) {
        months[monthYear].days[dayDate] = {
          label: dayDate,
          items: [],
          totalIncome: 0,
          totalExpense: 0
        };
      }

      months[monthYear].days[dayDate].items.push(t);
      if (t.type === 'income') {
        months[monthYear].days[dayDate].totalIncome += t.amount;
      } else {
        months[monthYear].days[dayDate].totalExpense += t.amount;
      }
    });

    return Object.values(months);
  }, [transactions]);

  // Auth and Supabase Sync
  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id);
      }
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
      }
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116' || error.code === '42P01') {
          // Fallback to metadata if profile doesn't exist or table missing
          const { data: { user: authUser } } = await supabase.auth.getUser();
          const initialProfile = {
            id: userId,
            full_name: authUser?.user_metadata?.full_name || 'User Flux',
            avatar_url: authUser?.user_metadata?.avatar_url || null
          };
          
          if (error.code === 'PGRST116') {
            await supabase.from('profiles').upsert(initialProfile);
          }
          
          setProfile(initialProfile);
        }
        return;
      }
      
      if (data) setProfile(data);
    } catch (e) {
      console.error('Error fetching profile:', e);
    }
  };

  // Fetch Transactions when user changes
  const fetchTransactions = async () => {
    if (!user || !supabase) {
      setTransactions([]);
      return;
    }
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching transactions:', error);
      if (error.code === '42P01') {
        showToast('Error: Tabel "transactions" belum dibuat di Supabase.', 'error');
      } else if (error.code === '42703') {
        showToast('Error: Kolom "date" tidak ditemukan di tabel Supabase.', 'error');
      } else if (error.message.includes('permission denied')) {
        showToast('Error RLS: Akses ditolak.', 'error');
      }
      return;
    }

    if (data) {
      setTransactions(data.map(t => ({
        ...t,
        date: new Date(t.date).getTime() // Convert ISO string back to timestamp for app logic
      })));
    }
  };

  useEffect(() => {
    if (!user || !supabase) {
      setTransactions([]);
      return;
    }

    fetchTransactions();

    // Subscribe to changes
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
        },
        () => {
          fetchTransactions();
        }
      )
      .subscribe();

    return () => {
      if (supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [user]);

  // Auto-focus amount input
  useEffect(() => {
    amountInputRef.current?.focus();
  }, []);

  const totalIncome = useMemo(() => {
    return transactions
      .filter((t) => t.type === 'income')
      .reduce((acc, t) => acc + t.amount, 0);
  }, [transactions]);

  const totalExpense = useMemo(() => {
    return transactions
      .filter((t) => t.type === 'expense')
      .reduce((acc, t) => acc + t.amount, 0);
  }, [transactions]);

  const balance = useMemo(() => totalIncome - totalExpense, [totalIncome, totalExpense]);

  // Chart Data Calculations
  const chartData = useMemo(() => {
    // 1. Category Pie Data (Expenses only)
    const catMap: Record<string, number> = {};
    transactions.filter(t => t.type === 'expense').forEach(t => {
      catMap[t.category] = (catMap[t.category] || 0) + t.amount;
    });
    const pieData = Object.entries(catMap).map(([name, value]) => ({
      name,
      value,
      color: CATEGORIES.find(c => c.name === name)?.color || '#888'
    })).sort((a, b) => b.value - a.value);

    // 2. Monthly Bar Data (Last 6 months)
    const monthlyMap: Record<string, { income: number, expense: number }> = {};
    const sortedTs = [...transactions].sort((a, b) => a.date - b.date);
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toLocaleDateString('id-ID', { month: 'short' });
      monthlyMap[key] = { income: 0, expense: 0 };
    }

    transactions.forEach(t => {
      const d = new Date(t.date);
      const key = d.toLocaleDateString('id-ID', { month: 'short' });
      if (monthlyMap[key]) {
        if (t.type === 'income') monthlyMap[key].income += t.amount;
        else monthlyMap[key].expense += t.amount;
      }
    });
    const barData = Object.entries(monthlyMap).map(([name, data]) => ({
      name,
      ...data
    }));

    // 3. Balance Trend Data (All time)
    let runningBal = 0;
    const lineData = sortedTs.map(t => {
      runningBal += (t.type === 'income' ? t.amount : -t.amount);
      return {
        date: new Date(t.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
        balance: runningBal
      };
    });

    return { pieData, barData, lineData };
  }, [transactions]);

  // --- Tahap 2 Logic ---
  const DateStats = useMemo(() => {
    const now = new Date();
    const todayTimestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const thisMonthTimestamp = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const todayExpense = transactions
      .filter(t => t.type === 'expense' && t.date >= todayTimestamp)
      .reduce((acc, t) => acc + t.amount, 0);

    const monthExpense = transactions
      .filter(t => t.type === 'expense' && t.date >= thisMonthTimestamp)
      .reduce((acc, t) => acc + t.amount, 0);

    const monthIncome = transactions
      .filter(t => t.type === 'income' && t.date >= thisMonthTimestamp)
      .reduce((acc, t) => acc + t.amount, 0);

    return { todayExpense, monthExpense, monthIncome };
  }, [transactions]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !amount || isNaN(Number(amount)) || Number(amount) <= 0) return;

    try {
      if (!supabase) throw new Error('Supabase client not initialized');
      
      const rawDescription = description.trim() || (type === 'expense' ? category : 'Pemasukan');
      const formattedDescription = rawDescription
        .toLowerCase()
        .split(' ')
        .filter(word => word.length > 0)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      const newTransaction = {
        user_id: user.id,
        amount: Number(amount),
        category: type === 'expense' ? category : 'Pemasukan',
        type,
        description: formattedDescription,
        date: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('transactions')
        .insert([newTransaction]);

      if (error) throw error;
      
      showToast('Transaksi berhasil dicatat!', 'success');
      await fetchTransactions(); // Refresh data immediately
      setAmount('');
      setDescription('');
      amountInputRef.current?.focus();
    } catch (e: any) {
      console.error('Error creating transaction:', e);
      if (e.message?.includes('column "date" of relation "transactions" does not exist')) {
        showToast('Gagal: Kolom "date" tidak ditemukan di Supabase.', 'error');
      } else if (e.message?.includes('permission denied')) {
        showToast('Gagal: Masalah izin (RLS).', 'error');
      } else {
        showToast('Gagal menyimpan: ' + (e.message || 'Error tidak diketahui'), 'error');
      }
    }
  };

  const getEmoji = (catName: string) => {
    if (catName === 'Pemasukan') return '💰';
    return CATEGORIES.find((c) => c.name === catName)?.emoji || '💰';
  };

  const handleUpdateName = async () => {
    if (!newName.trim() || !supabase || !user) return;
    setIsUpdatingName(true);
    try {
      // 1. Update Auth Metadata (UI immediate update)
      const { data, error: authError } = await supabase.auth.updateUser({
        data: { full_name: newName.trim() }
      });
      if (authError) throw authError;

      // 2. Update Profiles Table (Persistent)
      const { error: dbError } = await supabase
        .from('profiles')
        .upsert({ id: user.id, full_name: newName.trim() });
      
      if (dbError) {
        if (dbError.code === '42P01') {
          showModal({
            title: 'Tabel Tidak Ditemukan',
            message: 'Tabel "profiles" belum ada di database Anda. Silakan buat tabelnya di SQL Editor.',
            confirmLabel: 'Salin SQL',
            type: 'confirm',
            onConfirm: () => {
              const sql = `CREATE TABLE profiles (\n  id uuid references auth.users not null primary key,\n  full_name text,\n  avatar_url text,\n  updated_at timestamp with time zone default timezone('utc'::text, now()) not null\n);\n\nALTER TABLE profiles ENABLE ROW LEVEL SECURITY;\n\nCREATE POLICY "Public profiles are viewable by everyone." ON profiles FOR SELECT USING (true);\nCREATE POLICY "Users can insert their own profile." ON profiles FOR INSERT WITH CHECK (auth.uid() = id);\nCREATE POLICY "Users can update own profile." ON profiles FOR UPDATE USING (auth.uid() = id);`;
              navigator.clipboard.writeText(sql);
              showToast('SQL disalin!', 'info');
              closeModal();
            }
          });
        } else throw dbError;
      }

      setUser(data.user);
      setProfile(prev => prev ? { ...prev, full_name: newName.trim() } : null);
      setIsEditingName(false);
      showToast('Nama berhasil diperbarui!', 'success');
    } catch (e: any) {
      console.error('Error updating name:', e);
      showToast('Gagal mengubah nama: ' + (e.message || 'Error tidak diketahui'), 'error');
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !supabase || !user) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('File terlalu besar. Maksimal 2MB.', 'error');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // 1. Update Metadata
      const { data: updateData, error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl }
      });
      if (updateError) throw updateError;

      // 2. Update Profiles Table
      const { error: dbError } = await supabase
        .from('profiles')
        .upsert({ id: user.id, avatar_url: publicUrl });

      if (dbError && dbError.code !== '42P01') throw dbError;

      setUser(updateData.user);
      setProfile(prev => prev ? { ...prev, avatar_url: publicUrl } : null);
      showToast('Foto profil berhasil diperbarui!', 'success');
    } catch (e: any) {
      console.error('Error uploading avatar:', e);
      // ... storage error handling remains the same
      if (e.message?.includes('row-level security policy') || e.code === '42501') {
        showModal({
          title: 'Izin Ditolak',
          message: 'Gagal mengunggah: Masalah RLS di Supabase Storage. Anda perlu mengizinkan upload publik untuk bucket "avatars".',
          confirmLabel: 'Salin SQL Perbaikan',
          type: 'confirm',
          onConfirm: () => {
            const sql = `CREATE POLICY "Allow public upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars');\nCREATE POLICY "Allow public select" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');`;
            navigator.clipboard.writeText(sql);
            showToast('SQL disalin! Tempel di SQL Editor Supabase.', 'success');
            closeModal();
          }
        });
      } else if (e.message?.includes('bucket not found')) {
        showToast('Gagal: Bucket "avatars" tidak ditemukan.', 'error');
      } else {
        showToast('Gagal mengunggah foto: ' + (e.message || 'Error tidak diketahui'), 'error');
      }
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const clearAllData = async () => {
    if (!user || !supabase) return;
    
    showModal({
      title: 'Hapus Data',
      message: 'Apakah Anda yakin ingin menghapus semua data transaksi? Tindakan ini tidak dapat dibatalkan.',
      confirmLabel: 'Hapus Sekarang',
      cancelLabel: 'Batal',
      type: 'confirm',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('transactions')
            .delete()
            .eq('user_id', user.id);

          if (error) throw error;
          await fetchTransactions();
          setActiveTab('home');
          showToast('Semua data berhasil dihapus.', 'success');
        } catch (e) {
          console.error('Error deleting data:', e);
          showToast('Gagal menghapus data.', 'error');
        }
        closeModal();
      }
    });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <motion.div
           animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
           transition={{ repeat: Infinity, duration: 2 }}
           className="w-12 h-12 border-2 border-accent rounded-full border-t-transparent animate-spin"
        />
      </div>
    );
  }

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (e: any) {
      showToast('Gagal terhubung ke Google: ' + (e.message || 'Error tidak diketahui'), 'error');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050505] text-white font-sans flex items-center justify-center p-6 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/5 rounded-full blur-[120px]" />

        <div className="max-w-[400px] w-full text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-12"
          >
            <div className="w-24 h-24 bg-accent rounded-[2.5rem] mx-auto mb-8 flex items-center justify-center shadow-[0_0_60px_rgba(204,255,0,0.25)] relative group">
              <div className="absolute inset-0 bg-accent rounded-[2.5rem] animate-pulse opacity-20 group-hover:opacity-40 transition-opacity" />
              <Wallet className="w-12 h-12 text-black relative z-10" />
            </div>
            <h1 className="text-5xl font-black tracking-tighter text-white mb-3 uppercase italic leading-none">
              Flux<br />Finance
            </h1>
            <p className="text-gray-500 text-[10px] uppercase tracking-[0.4em] font-bold">Simplify Your Freedom</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-6"
          >
            <button
              onClick={handleLogin}
              className="group w-full bg-white text-black font-black py-5 rounded-3xl flex items-center justify-center gap-4 hover:bg-zinc-100 transition-all active:scale-[0.98] shadow-[0_20px_40px_rgba(255,255,255,0.05)]"
            >
              <Chrome className="w-6 h-6" />
              <span className="uppercase text-[11px] tracking-[0.2em]">Masuk dengan Google</span>
              <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1 group-hover:-translate-y-1" />
            </button>
            


            <p className="text-[9px] text-gray-600 px-8 uppercase tracking-widest leading-loose font-medium opacity-50">
              Data Anda disimpan secara aman melalui enkripsi standar industri di sistem Cloud Flux.
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-accent selection:text-black">
      <div className="max-w-[500px] mx-auto bg-[#0A0A0A] min-h-screen border-x border-[#1A1A1A] shadow-2xl flex flex-col relative overflow-hidden">
        
        {/* Header / Status Bar */}
        <div className="px-6 pt-8 pb-4 flex justify-between items-center shrink-0">
          <div className="text-[10px] tracking-[0.2em] font-bold text-gray-500 uppercase">Flux Finance v1.0</div>
          <div className="flex gap-2">
            <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_rgba(204,255,0,0.8)]"></div>
            <div className="w-2 h-2 rounded-full bg-gray-800"></div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar pb-20">
          <AnimatePresence mode="wait">
            {activeTab === 'home' ? (
              <motion.div
                key="home"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              >
                {/* Balance Section */}
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="px-8 py-6 mb-2"
                >
                  <p className="text-gray-400 text-[10px] uppercase tracking-widest mb-1">Total Saldo</p>
                  <h1 className="text-4xl font-light text-accent tracking-tighter flex items-baseline gap-1">
                    <span className="text-lg opacity-70 font-bold">Rp</span>
                    <motion.span
                      key={balance}
                      initial={{ opacity: 0.5 }}
                      animate={{ opacity: 1 }}
                    >
                      {formatNumber(balance)}
                    </motion.span>
                  </h1>
                </motion.div>

                {/* Dashboard Tahap 2 */}
                <div className="px-8 pb-4 grid grid-cols-2 gap-3">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="col-span-2 bg-zinc-900/40 border border-zinc-800/50 p-6 rounded-3xl"
                  >
                    <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-1">Pengeluaran Hari Ini</p>
                    <div className="text-3xl font-light text-red-500 tracking-tighter">
                      <span className="text-sm font-bold mr-1">Rp</span>
                      {formatNumber(DateStats.todayExpense)}
                    </div>
                  </motion.div>

                  <div className="bg-[#111111] p-4 rounded-2xl border border-[#1A1A1A]">
                    <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-1">Bulan Ini (Keluar)</p>
                    <div className="text-red-400 font-mono text-sm">-{formatNumber(DateStats.monthExpense)}</div>
                  </div>
                  <div className="bg-[#111111] p-4 rounded-2xl border border-[#1A1A1A]">
                    <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-1">Bulan Ini (Masuk)</p>
                    <div className="text-accent font-mono text-sm">+{formatNumber(DateStats.monthIncome)}</div>
                  </div>
                </div>

                {/* Add Transaction Form Section */}
                <motion.section
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                  className="px-8 py-4"
                >
                  <div className="bg-[#111111] p-6 rounded-2xl border border-[#1A1A1A] shadow-sm">
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="block text-[10px] text-gray-500 uppercase mb-2">Jumlah</label>
                        <div className="flex items-baseline gap-2 group">
                          <span className="text-xl text-gray-400 font-bold group-focus-within:text-accent transition-colors">Rp</span>
                          <input
                            ref={amountInputRef}
                            type="text"
                            inputMode="numeric"
                            value={amount ? formatNumber(Number(amount)) : ''}
                            onChange={(e) => {
                              const rawValue = e.target.value.replace(/\D/g, '');
                              setAmount(rawValue);
                            }}
                            placeholder="0"
                            className="bg-transparent text-3xl focus:outline-none text-white w-full border-b border-[#1A1A1A] focus:border-accent pb-1 font-mono transition-colors"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col">
                          <label className="text-[10px] text-gray-500 uppercase mb-1">Tipe</label>
                          <div className="flex bg-[#050505] rounded-lg p-1 border border-[#1A1A1A]">
                            <button
                              type="button"
                              onClick={() => setType('expense')}
                              className={`flex-1 text-center py-1.5 text-[10px] uppercase font-bold rounded-md transition-all ${
                                type === 'expense' ? 'bg-accent text-black' : 'text-gray-500'
                              }`}
                            >
                              Keluar
                            </button>
                            <button
                              type="button"
                              onClick={() => setType('income')}
                              className={`flex-1 text-center py-1.5 text-[10px] uppercase font-bold rounded-md transition-all ${
                                type === 'income' ? 'bg-accent text-black' : 'text-gray-500'
                              }`}
                            >
                              Masuk
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <label className="text-[10px] text-gray-500 uppercase mb-1">Kategori</label>
                          <div className="relative">
                            {type === 'expense' ? (
                              <>
                                <select
                                  value={category}
                                  onChange={(e) => setCategory(e.target.value)}
                                  className="w-full bg-[#050505] border border-[#1A1A1A] rounded-lg p-2 text-[11px] appearance-none text-white focus:outline-none focus:border-accent pr-8 transition-colors"
                                >
                                  {CATEGORIES.map((cat) => (
                                    <option key={cat.name} value={cat.name}>
                                      {cat.emoji} {cat.name}
                                    </option>
                                  ))}
                                </select>
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-600 text-[10px]">▼</div>
                              </>
                            ) : (
                              <div className="w-full bg-[#111111] border border-[#1A1A1A] rounded-lg p-2 text-[11px] text-accent font-bold">
                                💰 Pemasukan
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] text-gray-500 uppercase mb-1 block">Keterangan (Opsional)</label>
                        <input
                          type="text"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Makan siang, bensin, dll."
                          className="w-full bg-[#050505] border border-[#1A1A1A] rounded-lg p-3 text-xs focus:ring-1 focus:ring-accent outline-none transition-all placeholder:text-gray-700"
                        />
                      </div>

                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        type="submit"
                        className="w-full bg-accent text-black font-bold py-3.5 rounded-xl uppercase text-[10px] tracking-widest shadow-[0_4px_20px_rgba(204,255,0,0.2)] hover:shadow-[0_4px_25px_rgba(204,255,0,0.3)] transition-all active:scale-[0.98]"
                      >
                        Catat Transaksi
                      </motion.button>
                    </form>
                  </div>
                </motion.section>

                {/* Aktivitas Terbaru (Ringkasan singkat di Home) */}
                <section className="px-8 py-4">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Aktivitas Terbaru</h2>
                    <span 
                      onClick={() => setActiveTab('history')}
                      className="text-[10px] text-accent font-bold uppercase tracking-widest cursor-pointer hover:underline"
                    >
                      LIHAT SEMUA
                    </span>
                  </div>
                  
                  <div className="space-y-3">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {transactions.length === 0 ? (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="py-12 text-center text-gray-600 text-[10px] uppercase font-bold tracking-widest border border-dashed border-[#1A1A1A] rounded-2xl"
                        >
                          Belum ada data aktivitas
                        </motion.div>
                      ) : (
                        transactions.slice(0, 5).map((t) => (
                          <motion.div
                            layout
                            key={t.id}
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className="group flex items-center justify-between bg-[#111111] p-3 rounded-xl border border-[#1A1A1A] hover:border-[#2A2A2A] transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-[#1A1A1A] flex items-center justify-center rounded-lg text-lg shadow-inner border border-[#222]">
                                {getEmoji(t.category)}
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-medium tracking-tight truncate max-w-[150px]">{t.description}</div>
                                <div className="text-[9px] text-gray-500 uppercase tracking-wider font-bold">
                                  {t.category} • {new Date(t.date).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })}
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-4 shrink-0">
                              <div className={`text-xs font-mono font-bold ${t.type === 'income' ? 'text-accent' : 'text-red-400'}`}>
                                {t.type === 'income' ? '+' : '-'}{formatNumber(t.amount)}
                              </div>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </AnimatePresence>
                  </div>
                </section>
              </motion.div>
            ) : activeTab === 'history' ? (
              <motion.div
                key="history"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                className="px-8 py-4"
              >
                <div className="mb-8">
                  <h1 className="text-2xl font-light tracking-tight text-accent mb-2">Riwayat Transaksi</h1>
                  <p className="text-gray-500 text-[10px] uppercase tracking-widest font-bold">Ringkasan pengeluaran bulanan Anda</p>
                </div>

                {groupedTransactions.length === 0 ? (
                  <div className="py-20 text-center text-gray-600 border border-dashed border-[#1A1A1A] rounded-3xl">
                    <p className="text-xs uppercase tracking-widest font-bold">Belum ada riwayat tercatat</p>
                  </div>
                ) : (
                  <div className="space-y-10">
                    {groupedTransactions.map((month) => (
                      <div key={month.label}>
                        <div className="sticky top-0 bg-[#0A0A0A]/90 backdrop-blur-sm z-20 py-2 mb-4 border-b border-[#1A1A1A]">
                          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-accent">{month.label}</h2>
                        </div>
                        
                        <div className="space-y-8">
                          {Object.values(month.days).map((day: any) => (
                            <div key={day.label}>
                              <div className="flex justify-between items-end mb-3 px-1">
                                <div className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">{day.label}</div>
                              </div>
                              <div className="bg-[#111111]/50 border border-[#1A1A1A] rounded-2xl overflow-hidden divide-y divide-[#1A1A1A]">
                                {day.items.map((t: Transaction) => (
                                  <div key={t.id} className="flex items-center justify-between p-4 hover:bg-[#1A1A1A]/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-sm">
                                        {getEmoji(t.category)}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="text-xs text-gray-200">{t.description}</div>
                                        <div className="text-[8px] text-gray-600 uppercase font-bold tracking-widest">{t.category}</div>
                                      </div>
                                    </div>
                                    <div className={`text-xs font-mono font-bold ${t.type === 'income' ? 'text-accent' : 'text-red-400'}`}>
                                      {t.type === 'income' ? '+' : '-'}{formatNumber(t.amount)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="account"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                className="px-8 py-4 pb-24"
              >
                <div className="mb-10 text-center relative">
                  <button 
                    onClick={() => signOut()}
                    className="absolute right-0 top-0 p-2 text-gray-500 hover:text-red-500 transition-colors"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                  <div className="relative w-24 h-24 mx-auto mb-4">
                    <div className="absolute inset-0 bg-accent rounded-3xl blur-2xl opacity-20"></div>
                    <div className="w-24 h-24 bg-[#111111] border border-zinc-800 rounded-3xl relative overflow-hidden flex items-center justify-center shadow-[0_0_30px_rgba(204,255,0,0.1)]">
                      {isUploadingAvatar ? (
                        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      ) : profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <UserIcon className="w-10 h-10 text-accent/50" />
                      )}
                    </div>
                    {/* Camera Button */}
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingAvatar}
                      className="absolute -right-2 -bottom-2 w-8 h-8 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-accent hover:bg-zinc-800 transition-colors shadow-lg z-10"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleAvatarUpload} 
                      accept="image/*" 
                      className="hidden" 
                    />
                  </div>
                  
                  <div className="flex flex-col items-center gap-2">
                    {isEditingName ? (
                      <div className="w-full max-w-[250px] space-y-2">
                        <input
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdateName();
                            if (e.key === 'Escape') setIsEditingName(false);
                          }}
                          autoFocus
                          className="w-full bg-[#050505] border border-accent/30 rounded-lg p-2 text-sm text-center focus:border-accent outline-none font-medium"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleUpdateName}
                            disabled={isUpdatingName}
                            className="flex-1 bg-accent text-black text-[10px] font-bold py-1.5 rounded-md uppercase tracking-widest disabled:opacity-50"
                          >
                            {isUpdatingName ? 'Menyimpan...' : 'Simpan'}
                          </button>
                          <button
                            onClick={() => setIsEditingName(false)}
                            className="flex-1 bg-zinc-800 text-white text-[10px] font-bold py-1.5 rounded-md uppercase tracking-widest"
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-light text-white tracking-tight">{profile?.full_name || user.user_metadata?.full_name || 'User Flux'}</h1>
                        <button 
                          onClick={() => {
                            setNewName(profile?.full_name || user.user_metadata?.full_name || '');
                            setIsEditingName(true);
                          }}
                          className="p-1 text-gray-500 hover:text-accent transition-all"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <p className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mt-1 bg-zinc-900/50 inline-block px-3 py-1 rounded-full border border-zinc-800">Free User</p>
                </div>

                <div className="space-y-6 mb-10">
                  {/* Stats Summary */}
                  <div className="bg-[#111111] border border-[#1A1A1A] p-5 rounded-2xl">
                    <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-3">Statistik Keseluruhan</p>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-gray-400">Total Pemasukan</span>
                        <span className="text-sm font-mono text-accent">+{formatNumber(totalIncome)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-gray-400">Total Pengeluaran</span>
                        <span className="text-sm font-mono text-red-400">-{formatNumber(totalExpense)}</span>
                      </div>
                      <div className="h-px bg-[#1A1A1A] my-2"></div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-white uppercase tracking-widest">Saldo Akhir</span>
                        <span className={`text-lg font-mono font-bold ${balance >= 0 ? 'text-accent' : 'text-red-500'}`}>
                          {formatNumber(balance)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Pie Chart: Kategori */}
                  <div className="bg-[#111111] border border-[#1A1A1A] p-5 rounded-2xl">
                    <div className="flex items-center gap-2 mb-4">
                      <PieIcon className="w-3.5 h-3.5 text-accent" />
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Distribusi Pengeluaran</p>
                    </div>
                    <div className="h-48 w-full">
                      {chartData.pieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={chartData.pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={70}
                              paddingAngle={5}
                              dataKey="value"
                              stroke="none"
                            >
                              {chartData.pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <ReTooltip 
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  return (
                                    <div className="bg-black/90 border border-zinc-800 p-2 rounded-lg text-[10px] font-bold">
                                      <p className="text-white mb-1 uppercase tracking-widest">{payload[0].name}</p>
                                      <p className="text-accent">Rp {formatNumber(Number(payload[0].value))}</p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-gray-600 text-[10px] uppercase font-bold tracking-widest">
                          Belum ada data pengeluaran
                        </div>
                      )}
                    </div>
                    {chartData.pieData.slice(0, 4).map((entry, idx) => (
                      <div key={idx} className="flex justify-between items-center mt-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
                          <span className="text-[10px] text-gray-400">{entry.name}</span>
                        </div>
                        <span className="text-[10px] font-mono font-bold">{Math.round((entry.value / totalExpense) * 100)}%</span>
                      </div>
                    ))}
                  </div>

                  {/* Bar Chart: Tren Bulanan */}
                  <div className="bg-[#111111] border border-[#1A1A1A] p-5 rounded-2xl">
                    <div className="flex items-center gap-2 mb-6">
                      <BarChart3 className="w-3.5 h-3.5 text-accent" />
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Tren Pemasukan vs Pengeluaran</p>
                    </div>
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData.barData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" vertical={false} />
                          <XAxis 
                            dataKey="name" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#444', fontSize: 10 }} 
                            dy={10}
                          />
                          <YAxis hide />
                          <ReTooltip 
                            cursor={{ fill: '#1A1A1A' }}
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-black/90 border border-zinc-800 p-2 rounded-lg text-[9px] font-bold space-y-1">
                                    <p className="text-accent">Masuk: {formatNumber(payload[0].value as number)}</p>
                                    <p className="text-red-400">Keluar: {formatNumber(payload[1].value as number)}</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="income" fill="#CCFF00" radius={[4, 4, 0, 0]} barSize={8} />
                          <Bar dataKey="expense" fill="#FF0040" radius={[4, 4, 0, 0]} barSize={8} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Line Chart: Pergerakan Saldo */}
                  <div className="bg-[#111111] border border-[#1A1A1A] p-5 rounded-2xl">
                    <div className="flex items-center gap-2 mb-6">
                      <TrendingUp className="w-3.5 h-3.5 text-accent" />
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Pertumbuhan Saldo</p>
                    </div>
                    <div className="h-48 w-full">
                      {chartData.lineData.length > 1 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData.lineData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" vertical={false} />
                            <XAxis 
                              dataKey="date" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#444', fontSize: 8 }} 
                              dy={10} 
                              interval="preserveStartEnd"
                            />
                            <YAxis hide />
                            <ReTooltip 
                               content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  return (
                                    <div className="bg-black/90 border border-zinc-800 p-2 rounded-lg text-[10px] font-bold">
                                      <p className="text-gray-500 mb-0.5">{payload[0].payload.date}</p>
                                      <p className="text-accent">Rp {formatNumber(payload[0].value as number)}</p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="balance" 
                              stroke="#CCFF00" 
                              strokeWidth={2} 
                              dot={false}
                              animationDuration={1500}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-gray-600 text-[10px] uppercase font-bold tracking-widest">
                          Butuh lebih dari 1 transaksi untuk tren
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-10">
                  <p className="text-[9px] text-red-500/50 uppercase tracking-widest font-bold mb-3 px-2">Zona Berbahaya</p>
                  <button 
                    onClick={clearAllData}
                    className="w-full flex items-center justify-center gap-2 bg-red-500/5 border border-red-500/20 py-4 rounded-2xl text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Hapus Semua Data</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Navigation */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-[#0A0A0A]/95 backdrop-blur-md border-t border-[#1A1A1A] flex items-center justify-around px-8 z-30">
          <div 
            onClick={() => setActiveTab('home')}
            className={`text-[9px] font-bold uppercase tracking-widest flex flex-col items-center gap-1 cursor-pointer transition-colors ${
              activeTab === 'home' ? 'text-accent' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            {activeTab === 'home' && <div className="w-1 h-1 rounded-full bg-accent"></div>}
            <Wallet className="w-4 h-4 mb-0.5" />
            Home
          </div>
          <div 
            onClick={() => setActiveTab('history')}
            className={`text-[9px] font-bold uppercase tracking-widest flex flex-col items-center gap-1 cursor-pointer transition-colors ${
              activeTab === 'history' ? 'text-accent' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            {activeTab === 'history' && <div className="w-1 h-1 rounded-full bg-accent"></div>}
            <History className="w-4 h-4 mb-0.5" />
            Riwayat
          </div>
          <div 
            onClick={() => setActiveTab('account')}
            className={`text-[9px] font-bold uppercase tracking-widest flex flex-col items-center gap-1 cursor-pointer transition-colors ${
              activeTab === 'account' ? 'text-accent' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            {activeTab === 'account' && <div className="w-1 h-1 rounded-full bg-accent"></div>}
            <UserIcon className="w-4 h-4 mb-0.5" />
            Akun
          </div>
        </div>

        {/* --- Global UI Components --- */}

        {/* Custom Modal */}
        <AnimatePresence>
          {modal.isOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeModal}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-[340px] bg-[#111111] border border-zinc-800 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent/30 to-transparent"></div>
                
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mb-2 ${
                    modal.type === 'confirm' ? 'bg-red-500/10 text-red-500' : 'bg-accent/10 text-accent'
                  }`}>
                    {modal.type === 'confirm' ? <Trash2 className="w-8 h-8" /> : <Info className="w-8 h-8" />}
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold tracking-tight text-white uppercase italic">{modal.title}</h3>
                    <p className="text-xs text-gray-400 leading-relaxed font-medium uppercase tracking-wider">{modal.message}</p>
                  </div>

                  <div className="flex flex-col w-full gap-3 pt-4">
                    {modal.type === 'confirm' ? (
                      <>
                        <button
                          onClick={modal.onConfirm}
                          className="w-full bg-red-600 text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-[0.2em] shadow-[0_4px_20px_rgba(220,38,38,0.3)] active:scale-[0.98] transition-all"
                        >
                          {modal.confirmLabel || 'OK'}
                        </button>
                        <button
                          onClick={closeModal}
                          className="w-full bg-zinc-900 border border-zinc-800 text-gray-400 font-bold py-4 rounded-2xl uppercase text-[10px] tracking-widest active:scale-[0.98] transition-all"
                        >
                          {modal.cancelLabel || 'Batal'}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={closeModal}
                        className="w-full bg-accent text-black font-black py-4 rounded-2xl uppercase text-[10px] tracking-[0.2em] shadow-[0_4px_20px_rgba(204,255,0,0.3)] active:scale-[0.98] transition-all"
                      >
                        {modal.confirmLabel || 'Dimengerti'}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Toast Notifications */}
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[110] w-full max-w-[400px] px-6 pointer-events-none">
          <div className="flex flex-col gap-3 items-center">
            <AnimatePresence>
              {toasts.map((toast) => (
                <motion.div
                  key={toast.id}
                  initial={{ opacity: 0, y: -20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                  className="pointer-events-auto"
                >
                  <div className="bg-[#111111]/90 backdrop-blur-xl border border-zinc-800/50 shadow-2xl rounded-2xl px-5 py-4 flex items-center gap-4 min-w-[300px]">
                    <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${
                      toast.type === 'success' ? 'bg-accent/10 text-accent' : 
                      toast.type === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-400'
                    }`}>
                      {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : 
                       toast.type === 'error' ? <XCircle className="w-4 h-4" /> : <Info className="w-4 h-4" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-[11px] font-black text-white uppercase tracking-wider leading-tight">
                        {toast.message}
                      </p>
                    </div>
                    <button 
                      onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                      className="text-gray-600 hover:text-white transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

      </div>
    </div>
  );
}
