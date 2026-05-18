import React, { useState } from 'react';
import { X, Command } from './Icon';
import { translations } from '../translations';
import { Language } from '../types';

interface CreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<boolean> | boolean;
  lang: Language;
}

const CreateServerModal: React.FC<CreateServerModalProps> = ({ isOpen, onClose, onCreate, lang }) => {
  const [serverName, setServerName] = useState('');
  const t = translations[lang];

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (serverName.trim()) {
      const created = await onCreate(serverName);
      if (created !== false) {
        setServerName('');
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#09090b] border border-border rounded-2xl shadow-2xl p-6 relative animate-in zoom-in-95 duration-200">
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
        >
            <X size={20} />
        </button>

        <div className="text-center mb-6">
            <div className="w-16 h-16 bg-indigo-600/20 rounded-2xl border border-indigo-500/30 flex items-center justify-center mx-auto mb-4 border-dashed">
                <Command size={32} className="text-indigo-400" />
            </div>
            <h2 className="text-xl font-bold text-white">{t.app.new_server_modal}</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t.app.server_name}</label>
                <input 
                    type="text" 
                    value={serverName}
                    onChange={(e) => setServerName(e.target.value)}
                    className="w-full h-11 bg-zinc-950 border border-zinc-800 rounded-md px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all"
                    placeholder="My Awesome Server"
                    autoFocus
                />
            </div>

            <div className="flex items-center justify-between pt-4">
                <button 
                    type="button" 
                    onClick={onClose}
                    className="text-sm font-medium text-gray-400 hover:text-white transition-colors px-4"
                >
                    {t.app.cancel_btn}
                </button>
                <button 
                    type="submit"
                    disabled={!serverName.trim()}
                    className="h-10 px-6 bg-indigo-600 text-white text-sm font-bold rounded-md hover:bg-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(79,70,229,0.3)]"
                >
                    {t.app.create_btn}
                </button>
            </div>
        </form>
      </div>
    </div>
  );
};

export default CreateServerModal;
