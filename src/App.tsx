import React, { useEffect, useState, useRef } from 'react';
import { Power, Thermometer, Droplets, Mic, Key, Activity, ToggleLeft, ToggleRight } from 'lucide-react';
import { format } from 'date-fns';

type MessageEvent = {
  id: string;
  brokerId: string;
  topic: string;
  payload: string;
  timestamp: string;
};

type ActivityLog = {
  id: string;
  time: string;
  message: string;
};

export default function App() {
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [flespiToken, setFlespiToken] = useState('G68ycRF9Y051H0GMWLNXBmHKzucfa7aocPeH1hPtcQyZyGE8ukxaUbAwE3N0RuSe');
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  // Sensor Data
  const [temp, setTemp] = useState<string>('29.3');
  const [humidity, setHumidity] = useState<string>('83.6');

  // Relays and Patterns
  const [relays, setRelays] = useState([false, false, false, false]);
  const [patterns, setPatterns] = useState([false, false]); // Pola 1, Pola 2

  const addLog = (msg: string) => {
    setLogs((prev) => [
      { id: Math.random().toString(36).slice(2), time: format(new Date(), 'h:mm:ss a'), message: msg },
      ...prev,
    ].slice(0, 50));
  };

  useEffect(() => {
    const eventSource = new EventSource('/api/stream');

    eventSource.addEventListener('status', (e) => {
      const newAuth = JSON.parse(e.data);
      setStatuses((prev) => {
        // Find changes
        Object.keys(newAuth).forEach((key) => {
          if (prev[key] !== newAuth[key]) {
            let readableName = key === 'mosquitto-public' ? 'Broker 1 (Mosquitto)' : key === 'flespi' ? 'Flespi' : 'Broker 3 (Mosquitto Auth)';
            if (newAuth[key] === 'Connected') {
              addLog(`[SYS] Terhubung ke ${readableName}`);
            } else if (newAuth[key].startsWith('Error')) {
              addLog(`[SYS] Gagal terhubung ${readableName}: ${newAuth[key].replace('Error: ', '')}`);
            } else if (newAuth[key] === 'Offline') {
              addLog(`[SYS] ${readableName} terputus (Offline)`);
            }
          }
        });
        return newAuth;
      });
    });

    eventSource.addEventListener('message', (e) => {
      const parsedMessage = JSON.parse(e.data) as MessageEvent;
      // Handle incoming sensor data (mocked format assumption)
      if (parsedMessage.topic.includes('temperature') || parsedMessage.topic.includes('suhu')) {
        setTemp(parseFloat(parsedMessage.payload).toFixed(1));
      }
      if (parsedMessage.topic.includes('humidity') || parsedMessage.topic.includes('kelembapan')) {
        setHumidity(parseFloat(parsedMessage.payload).toFixed(1));
      }
    });

    // Auto-subscribe to all default topics for the demo
    const subscribeAll = async () => {
       await fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brokerId: 'flespi', topic: 'sensor/#' }) });
    };
    subscribeAll();

    return () => {
      eventSource.close();
    };
  }, []);

  const handleUpdateFlespi = async () => {
    addLog(`[SYS] Memperbarui token Flespi...`);
    try {
      await fetch('/api/config/flespi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: flespiToken })
      });
    } catch (e) {
      addLog(`[SYS] Gagal mengatur token Flespi.`);
    }
  };

  const publishControl = async (topic: string, message: string) => {
    // Defaulting control to Flespi broker as requested "Broker 2"
    try {
      await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerId: 'flespi', topic, message }),
      });
      addLog(`[CMD] -> ${topic}: ${message}`);
    } catch (e) {
      addLog(`[ERROR] Gagal mengirim pesan ke ${topic}`);
    }
  };

  const toggleRelay = (index: number) => {
    const newState = [...relays];
    newState[index] = !newState[index];
    setRelays(newState);
    publishControl(`kontrol/relay/${index + 1}`, newState[index] ? 'ON' : 'OFF');
  };

  const togglePattern = (index: number) => {
    const newState = [...patterns];
    newState[index] = !newState[index];
    setPatterns(newState);
    publishControl(`kontrol/pola/${index + 1}`, newState[index] ? 'ON' : 'OFF');
  };

  const isConnected = (id: string) => statuses[id] === 'Connected';

  return (
    <div className="min-h-screen bg-[#0d0d12] text-slate-300 font-sans p-4 md:p-8">
      <div className="max-w-[1400px] mx-auto space-y-8">
        
        {/* Top Navigation */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-white/5 pb-4 gap-4">
          <div className="flex items-center gap-3">
             <div className="w-2 h-8 bg-fuchsia-600 rounded-full shadow-[0_0_15px_rgba(217,70,239,0.5)]"></div>
             <div>
               <h1 className="text-2xl font-bold tracking-wider flex items-center gap-2 text-white">
                 IOT DASHBOARD <span className="font-light text-fuchsia-500">SISTEM KONTROL</span>
               </h1>
               <p className="text-xs text-slate-500 tracking-[0.2em] uppercase mt-1">Web Broker & Voice Command</p>
             </div>
          </div>
          <div className="flex items-center gap-3 text-xs tracking-widest text-slate-500">
            STATUS SISTEM
            <span className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full font-medium border border-emerald-500/20">AKTIF</span>
          </div>
        </header>

        {/* Broker Status Bar */}
        <div className="flex flex-wrap items-center justify-between bg-[#13131a] rounded-xl p-4 border border-white/5 shadow-xl">
           <div className="flex items-center gap-24 flex-1 justify-around text-sm font-bold text-slate-400 tracking-wider">
              <div className="flex items-center gap-4">
                 MOSQUITTO PUB
                 <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1.5 ${isConnected('mosquitto-public') ? 'text-emerald-500' : 'text-red-500'}`}>
                    {isConnected('mosquitto-public') ? 'CONNECTED' : 'DISCONNECT'}
                    <div className={`w-2 h-2 rounded-full ${isConnected('mosquitto-public') ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'}`}></div>
                 </span>
              </div>
              <div className="flex items-center gap-4">
                 FLESPI
                 <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1.5 ${isConnected('flespi') ? 'text-emerald-500' : 'text-red-500'}`}>
                    {isConnected('flespi') ? 'CONNECTED' : 'DISCONNECT'}
                    <div className={`w-2 h-2 rounded-full ${isConnected('flespi') ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'}`}></div>
                 </span>
              </div>
              <div className="flex items-center gap-4">
                 MOSQUITTO AUTH
                 <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1.5 ${isConnected('mosquitto-auth') ? 'text-emerald-500' : 'text-red-500'}`}>
                    {isConnected('mosquitto-auth') ? 'CONNECTED' : 'DISCONNECT'}
                    <div className={`w-2 h-2 rounded-full ${isConnected('mosquitto-auth') ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'}`}></div>
                 </span>
              </div>
           </div>
        </div>

        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr_1fr] gap-6">
           
           {/* Left Column (Sensors & Config) */}
           <div className="space-y-6">
              
              {/* Sensor Card */}
              <div className="bg-[#13131a] rounded-2xl p-6 border border-white/5 shadow-xl relative overflow-hidden h-[340px]">
                 <div className="absolute top-6 right-6 text-fuchsia-600/10">
                    <Thermometer className="w-24 h-24" />
                 </div>
                 <h2 className="flex items-center gap-2 text-sm font-bold tracking-widest text-slate-300 mb-8">
                   <Activity className="w-4 h-4 text-fuchsia-500" />
                   DATA SENSOR
                 </h2>

                 <div className="space-y-6">
                   <div>
                     <p className="text-xs font-bold text-blue-500 tracking-wider mb-1">TEMPERATUR SUHU</p>
                     <div className="flex items-baseline gap-1">
                        <span className="text-6xl font-light tracking-tighter text-blue-400 drop-shadow-[0_0_15px_rgba(96,165,250,0.4)]">{temp}</span>
                        <span className="text-2xl text-slate-500">°C</span>
                     </div>
                     <div className="h-[2px] w-full bg-blue-500/20 mt-4 rounded-full overflow-hidden">
                       <div className="h-full bg-blue-500 w-[60%] shadow-[0_0_10px_rgba(96,165,250,0.8)]"></div>
                     </div>
                   </div>

                   <div>
                     <p className="text-xs font-bold text-fuchsia-500 tracking-wider mb-1">KELEMBAPAN UDARA</p>
                     <div className="flex items-baseline gap-1">
                        <span className="text-6xl font-light tracking-tighter text-fuchsia-400 drop-shadow-[0_0_15px_rgba(217,70,239,0.4)]">{humidity}</span>
                        <span className="text-2xl text-slate-500">%</span>
                     </div>
                     <div className="h-[2px] w-full bg-fuchsia-500/20 mt-4 rounded-full overflow-hidden">
                       <div className="h-full bg-fuchsia-500 w-[80%] shadow-[0_0_10px_rgba(217,70,239,0.8)]"></div>
                     </div>
                   </div>
                 </div>
              </div>

              {/* Flespi Config */}
              <div className="bg-[#13131a] rounded-2xl p-6 border border-white/5 shadow-xl">
                 <h2 className="flex items-center gap-2 text-sm font-bold tracking-widest text-slate-300 mb-4">
                   <Key className="w-4 h-4 text-fuchsia-500" />
                   KONFIGURASI FLESPI
                 </h2>
                 <p className="text-xs text-slate-500 italic mb-4">
                   Masukkan Token Flespi untuk mengaktifkan broker eksternal (Broker 2).
                 </p>
                 <div className="flex flex-col gap-3">
                   <input 
                     type="text" 
                     value={flespiToken}
                     onChange={(e) => setFlespiToken(e.target.value)}
                     className="w-full bg-[#1c1c24] border border-white/5 rounded-lg px-4 py-3 text-sm text-slate-300 font-mono focus:outline-none focus:border-fuchsia-500/50"
                     placeholder="Token..."
                   />
                   <button 
                     onClick={handleUpdateFlespi}
                     className="bg-[#1c1c24] hover:bg-[#252530] border border-white/5 text-slate-300 py-3 rounded-lg text-sm font-bold tracking-wider transition-all hover:border-fuchsia-500/50"
                   >
                     UPDATE TOKEN
                   </button>
                 </div>
              </div>

           </div>

           {/* Middle Column (Relays & Patterns) */}
           <div className="space-y-6">
              
              {/* Relays */}
              <div className="bg-[#13131a] rounded-2xl p-6 border border-white/5 shadow-xl">
                 <h2 className="flex items-center gap-2 text-sm font-bold tracking-widest text-slate-300 mb-6">
                   <Power className="w-4 h-4 text-fuchsia-500" />
                   KONTROL RELAY
                 </h2>
                 <div className="grid grid-cols-2 gap-4">
                   {[1, 2, 3, 4].map((num, i) => (
                      <button 
                         key={num}
                         onClick={() => toggleRelay(i)}
                         className={`relative overflow-hidden group flex flex-col items-center justify-center p-8 rounded-xl border transition-all duration-300 ${relays[i] ? 'bg-fuchsia-500/10 border-fuchsia-500/30' : 'bg-[#1c1c24] border-white/5 hover:border-white/10'}`}
                      >
                         <span className="text-xs font-bold tracking-widest text-slate-400 mb-3">RELAY {num}</span>
                         <span className={`text-3xl font-black tracking-widest ${relays[i] ? 'text-fuchsia-400 drop-shadow-[0_0_12px_rgba(217,70,239,0.6)]' : 'text-slate-600'}`}>
                           {relays[i] ? 'ON' : 'OFF'}
                         </span>
                      </button>
                   ))}
                 </div>
              </div>

              {/* Light Patterns */}
              <div className="bg-[#13131a] rounded-2xl p-6 border border-white/5 shadow-xl">
                 <h2 className="flex items-center gap-2 text-sm font-bold tracking-widest text-slate-300 mb-6">
                   <ToggleLeft className="w-4 h-4 text-fuchsia-500" />
                   POLA LAMPU
                 </h2>
                 <div className="space-y-4">
                    <div className="flex items-center justify-between bg-[#1c1c24] p-5 rounded-xl border border-white/5">
                       <span className="text-sm font-medium text-slate-300">Pola 1: Kiri ke Kanan</span>
                       <button onClick={() => togglePattern(0)} className="text-slate-400 hover:text-fuchsia-400 transition-colors">
                         {patterns[0] ? <ToggleRight className="w-8 h-8 text-fuchsia-500" /> : <ToggleLeft className="w-8 h-8" />}
                       </button>
                    </div>
                    <div className="flex items-center justify-between bg-[#1c1c24] p-5 rounded-xl border border-white/5">
                       <span className="text-sm font-medium text-slate-300">Pola 2: Strobe Mode</span>
                       <button onClick={() => togglePattern(1)} className="text-slate-400 hover:text-fuchsia-400 transition-colors">
                         {patterns[1] ? <ToggleRight className="w-8 h-8 text-fuchsia-500" /> : <ToggleLeft className="w-8 h-8" />}
                       </button>
                    </div>
                 </div>
              </div>

           </div>

           {/* Right Column (Logs) */}
           <div className="bg-[#13131a] rounded-2xl p-6 border border-white/5 shadow-xl flex flex-col h-full min-h-[600px]">
               <h2 className="flex items-center gap-2 text-sm font-bold tracking-widest text-slate-300 mb-6 shrink-0">
                 <Activity className="w-4 h-4 text-fuchsia-500" />
                 LOG AKTIFITAS
               </h2>
               
               <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                  {logs.length === 0 ? (
                    <p className="text-sm text-slate-600 italic">Belum ada aktifitas.</p>
                  ) : (
                    logs.map((log) => (
                      <div key={log.id} className="text-xs font-mono border-b border-white/5 pb-3">
                         <span className="text-slate-500">[{log.time}]</span>{' '}
                         <span className={`
                           ${log.message.includes('Terhubung') ? 'text-emerald-400' : ''}
                           ${log.message.includes('Gagal') || log.message.includes('terputus') ? 'text-red-400' : ''}
                           ${log.message.includes('CMD') ? 'text-fuchsia-400' : ''}
                           ${!log.message.match(/Terhubung|Gagal|terputus|CMD/) ? 'text-slate-300' : ''}
                         `}>
                           {log.message}
                         </span>
                      </div>
                    ))
                  )}
               </div>
           </div>

        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
      `}</style>
    </div>
  );
}
