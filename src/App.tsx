import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Languages, 
  Cpu, 
  Terminal, 
  Settings, 
  Sparkles, 
  Loader2,
  Image as ImageIcon,
  X,
  ExternalLink,
  Globe,
  Volume2,
  VolumeX,
  History,
  Plus,
  LogOut,
  User as UserIcon,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { cn, formatTime } from './lib/utils';
import { Message, chatWithNNM, generateSpeech } from './services/geminiService';

interface User {
  id: number;
  username: string;
}

interface Chat {
  id: number;
  title: string;
  created_at: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ username: '', password: '' });
  const [authError, setAuthError] = useState('');

  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ data: string; mimeType: string } | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      fetchChats();
    }
  }, [user]);

  useEffect(() => {
    if (currentChatId) {
      fetchMessages(currentChatId);
    } else {
      setMessages([
        {
          role: 'model',
          content: 'Hello. I am NNM. How can I assist you today? / Салам. Мен NNM. Бүгүн сизге кантип жардам бере алам? / Здравствуйте. Я NNM. Чем я могу вам помочь сегодня?',
          timestamp: Date.now()
        }
      ]);
    }
  }, [currentChatId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      }
    } catch (e) {
      console.error('Auth check failed');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch(`/api/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data);
      } else {
        setAuthError(data.error);
      }
    } catch (e) {
      setAuthError('Authentication failed');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    setUser(null);
    setChats([]);
    setCurrentChatId(null);
    setMessages([]);
  };

  const fetchChats = async () => {
    const res = await fetch('/api/chats');
    if (res.ok) {
      const data = await res.json();
      setChats(data);
    }
  };

  const fetchMessages = async (chatId: number) => {
    const res = await fetch(`/api/chats/${chatId}/messages`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp).getTime()
      })));
    }
  };

  const createNewChat = async () => {
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Conversation' })
    });
    if (res.ok) {
      const newChat = await res.json();
      setChats([newChat, ...chats]);
      setCurrentChatId(newChat.id);
    }
  };

  const saveMessage = async (chatId: number, role: string, content: string) => {
    await fetch(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, content })
    });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      const data = base64.split(',')[1];
      setSelectedImage({
        data,
        mimeType: file.type
      });
    };
    reader.readAsDataURL(file);
  };

  const playAudio = async (base64Data: string, index: number) => {
    try {
      setIsSpeaking(index);
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const binaryString = window.atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0;
      }

      const audioBuffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => setIsSpeaking(null);
      source.start();
    } catch (error) {
      console.error('Audio playback error:', error);
      setIsSpeaking(null);
    }
  };

  const handleSpeech = async (text: string, index: number) => {
    if (isSpeaking !== null) return;
    
    try {
      setIsSpeaking(index);
      const base64Audio = await generateSpeech(text);
      await playAudio(base64Audio, index);
    } catch (error) {
      console.error('Speech generation error:', error);
      setIsSpeaking(null);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !selectedImage) || isTyping) return;

    let chatId = currentChatId;
    if (!chatId) {
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: input.slice(0, 30) || 'New Conversation' })
      });
      if (res.ok) {
        const newChat = await res.json();
        chatId = newChat.id;
        setCurrentChatId(chatId);
        setChats([newChat, ...chats]);
      } else {
        return;
      }
    }

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: Date.now(),
      image: selectedImage || undefined
    };

    setMessages(prev => [...prev, userMessage]);
    await saveMessage(chatId!, 'user', input);
    
    setInput('');
    setSelectedImage(null);
    setIsTyping(true);

    try {
      const updatedMessages = [...messages, userMessage];
      let fullResponse = '';
      let groundingUrls: string[] = [];
      
      const stream = chatWithNNM(updatedMessages);
      
      setMessages(prev => [...prev, { role: 'model', content: '', timestamp: Date.now() }]);
      
      for await (const chunk of stream) {
        fullResponse += chunk.text;
        if (chunk.groundingUrls) {
          groundingUrls = [...new Set([...groundingUrls, ...chunk.groundingUrls])];
        }
        
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1].content = fullResponse;
          newMessages[newMessages.length - 1].groundingUrls = groundingUrls;
          return newMessages;
        });
      }
      await saveMessage(chatId!, 'model', fullResponse);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { 
        role: 'model', 
        content: 'I encountered an error. Please check your connection or try again later.', 
        timestamp: Date.now() 
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="h-screen bg-[#0A0A0A] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#00FF00] animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen bg-[#0A0A0A] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-[#141414] border border-[#262626] p-8 rounded-2xl space-y-8"
        >
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-[#00FF00]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Cpu className="text-[#00FF00] w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">NNM <span className="text-[#00FF00]">CORE</span></h1>
            <p className="text-[#A3A3A3] text-sm italic">Advanced Neural Network Manager</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-mono uppercase tracking-widest text-[#A3A3A3]">Username</label>
              <input 
                type="text" 
                required
                value={authForm.username}
                onChange={e => setAuthForm({ ...authForm, username: e.target.value })}
                className="w-full bg-[#0A0A0A] border border-[#262626] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00FF00] transition-colors"
                placeholder="Enter identity..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-mono uppercase tracking-widest text-[#A3A3A3]">Password</label>
              <input 
                type="password" 
                required
                value={authForm.password}
                onChange={e => setAuthForm({ ...authForm, password: e.target.value })}
                className="w-full bg-[#0A0A0A] border border-[#262626] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00FF00] transition-colors"
                placeholder="Enter secure key..."
              />
            </div>
            {authError && (
              <p className="text-red-500 text-xs text-center font-medium">{authError}</p>
            )}
            <button 
              type="submit"
              className="w-full bg-[#00FF00] text-[#0A0A0A] font-bold py-3 rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              {authMode === 'login' ? 'Authenticate' : 'Register Identity'}
            </button>
          </form>

          <div className="text-center">
            <button 
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
              className="text-xs text-[#A3A3A3] hover:text-[#00FF00] transition-colors"
            >
              {authMode === 'login' ? "Don't have an identity? Register here" : "Already have an identity? Login here"}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-[#0A0A0A] text-white font-sans overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="h-full bg-[#141414] border-r border-[#262626] flex flex-col shrink-0"
          >
            <div className="p-4 border-b border-[#262626] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="text-[#00FF00] w-5 h-5" />
                <span className="font-bold text-sm tracking-tight">NNM HISTORY</span>
              </div>
              <button 
                onClick={() => setIsSidebarOpen(false)}
                className="p-1.5 hover:bg-[#0A0A0A] rounded-lg transition-colors text-[#A3A3A3]"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4">
              <button 
                onClick={createNewChat}
                className="w-full flex items-center gap-2 px-4 py-2.5 bg-[#00FF00] text-[#0A0A0A] rounded-xl font-bold text-xs hover:opacity-90 transition-all"
              >
                <Plus className="w-4 h-4" /> New Conversation
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {chats.map(chat => (
                <button
                  key={chat.id}
                  onClick={() => setCurrentChatId(chat.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group",
                    currentChatId === chat.id ? "bg-[#0A0A0A] border border-[#262626]" : "hover:bg-[#0A0A0A]/50 text-[#A3A3A3]"
                  )}
                >
                  <MessageSquare className={cn("w-4 h-4 shrink-0", currentChatId === chat.id ? "text-[#00FF00]" : "text-[#262626] group-hover:text-[#A3A3A3]")} />
                  <span className="text-xs truncate font-medium">{chat.title}</span>
                </button>
              ))}
            </div>

            <div className="p-4 border-t border-[#262626] space-y-4">
              <div className="flex items-center gap-3 px-2">
                <div className="w-8 h-8 bg-[#00FF00]/10 rounded-lg flex items-center justify-center">
                  <UserIcon className="w-4 h-4 text-[#00FF00]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{user.username}</p>
                  <p className="text-[10px] text-[#A3A3A3] uppercase tracking-widest">Authorized</p>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-2 hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-colors text-[#A3A3A3]"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {!isSidebarOpen && (
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="absolute left-4 top-4 z-20 p-2 bg-[#141414] border border-[#262626] rounded-xl text-[#A3A3A3] hover:text-white transition-all shadow-lg"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

        {/* Header */}
        <header className="h-16 border-b border-[#262626] flex items-center justify-between px-6 bg-[#141414]/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            {isSidebarOpen ? null : (
              <div className="w-8 h-8 bg-[#00FF00] rounded flex items-center justify-center shadow-[0_0_20px_rgba(0,255,0,0.15)]">
                <Cpu className="text-[#0A0A0A] w-5 h-5" />
              </div>
            )}
            <div>
              <h1 className="font-bold tracking-tighter text-lg">NNM <span className="text-[#00FF00]">CORE</span></h1>
              <div className="flex items-center gap-2 text-[10px] text-[#A3A3A3] uppercase tracking-widest">
                <span className="flex items-center gap-1"><Sparkles className="w-3 h-3 text-[#00FF00]" /> Active</span>
                <span className="opacity-30">|</span>
                <span>v3.1 Pro</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 text-xs text-[#A3A3A3]">
              <Languages className="w-4 h-4" />
              <span>KG / RU / EN</span>
            </div>
            <button className="p-2 hover:bg-[#141414] rounded-full transition-colors text-[#A3A3A3]">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Messages Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar"
        >
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex gap-4 max-w-4xl mx-auto",
                  msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded shrink-0 flex items-center justify-center text-[10px] font-bold",
                  msg.role === 'user' ? "bg-[#141414] border border-[#262626]" : "bg-[#00FF00] text-[#0A0A0A]"
                )}>
                  {msg.role === 'user' ? 'USR' : 'NNM'}
                </div>
                <div className={cn(
                  "space-y-2 min-w-0 flex-1",
                  msg.role === 'user' ? "text-right" : "text-left"
                )}>
                  <div className={cn("flex items-center gap-2 text-[10px] text-[#A3A3A3] font-mono", msg.role === 'user' ? "justify-end" : "justify-start")}>
                    <span>{formatTime(msg.timestamp)}</span>
                    {msg.role === 'model' && msg.content && (
                      <button 
                        onClick={() => handleSpeech(msg.content, idx)}
                        disabled={isSpeaking !== null}
                        className={cn(
                          "p-1 rounded hover:bg-[#141414] transition-colors",
                          isSpeaking === idx ? "text-[#00FF00]" : "text-[#A3A3A3]"
                        )}
                      >
                        {isSpeaking === idx ? <VolumeX className="w-3 h-3 animate-pulse" /> : <Volume2 className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                  <div className={cn(
                    "p-4 rounded-2xl text-sm leading-relaxed relative group inline-block max-w-full",
                    msg.role === 'user' ? "bg-[#141414] border border-[#262626]" : "bg-[#141414]/50"
                  )}>
                    {msg.image && (
                      <div className="mb-3">
                        <img 
                          src={`data:${msg.image.mimeType};base64,${msg.image.data}`} 
                          alt="User upload" 
                          className="max-w-sm rounded-lg border border-[#262626]"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                    <div className="prose prose-invert max-w-none prose-sm overflow-hidden">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                    {msg.groundingUrls && msg.groundingUrls.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-[#262626] space-y-2">
                        <div className="flex items-center gap-2 text-[10px] text-[#A3A3A3] uppercase tracking-widest font-bold">
                          <Globe className="w-3 h-3" /> Sources
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {msg.groundingUrls.map((url, i) => (
                            <a 
                              key={i} 
                              href={url} 
                              target="_blank" 
                              rel="noreferrer"
                              className="flex items-center gap-1.5 px-2 py-1 bg-[#141414] border border-[#262626] rounded text-[10px] text-[#A3A3A3] hover:text-[#00FF00] hover:border-[#00FF00] transition-all"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              {new URL(url).hostname}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {isTyping && (
            <div className="flex gap-4 max-w-4xl mx-auto">
              <div className="w-8 h-8 rounded shrink-0 flex items-center justify-center bg-[#00FF00] text-[#0A0A0A] text-[10px] font-bold animate-pulse">
                NNM
              </div>
              <div className="flex items-center gap-2 text-[#A3A3A3]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs font-mono uppercase tracking-widest">
                  Processing...
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-6 border-t border-[#262626] bg-[#141414]/80 backdrop-blur-md">
          <div className="max-w-4xl mx-auto space-y-4">
            {selectedImage && (
              <div className="relative inline-block">
                <img 
                  src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`} 
                  alt="Selected" 
                  className="h-20 w-20 object-cover rounded-lg border border-[#00FF00]"
                  referrerPolicy="no-referrer"
                />
                <button 
                  onClick={() => setSelectedImage(null)}
                  className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Command NNM..."
                className="w-full bg-[#141414] border border-[#262626] rounded-2xl px-5 py-4 pr-24 focus:outline-none focus:border-[#00FF00] transition-colors resize-none h-14 custom-scrollbar text-sm text-white"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleImageSelect}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-[#A3A3A3] hover:text-[#00FF00] transition-colors"
                >
                  <ImageIcon className="w-5 h-5" />
                </button>
                <button
                  onClick={() => { handleSend(); }}
                  disabled={(!input.trim() && !selectedImage) || isTyping}
                  className="p-2 bg-[#00FF00] text-[#0A0A0A] rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isTyping ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center px-2">
              <div className="flex gap-4 text-[10px] text-[#A3A3A3] uppercase tracking-widest font-mono">
                <span>System: Online</span>
                <span>Search: Enabled</span>
                <span>Encrypted: AES-256</span>
              </div>
              <div className="text-[10px] text-[#A3A3A3] italic">
                NNM is ready to help.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
