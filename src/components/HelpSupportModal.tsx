import { MessageCircle, Mail, X, ChevronRight } from 'lucide-react';

interface HelpSupportModalProps {
  onClose: () => void;
}

export default function HelpSupportModal({ onClose }: HelpSupportModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-surface-900/95 backdrop-blur-md p-5 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 w-8 h-8 rounded-lg flex items-center justify-center text-surface-500 hover:text-surface-200 hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="w-4 h-4 text-surface-400" />
          <div className="text-[10px] font-bold tracking-wider uppercase text-surface-500">Help & Support</div>
        </div>

        <div className="py-2.5 px-3 mb-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm text-surface-200 font-medium">Hi. How can we help?</span>
          </div>
          <p className="text-[12px] text-surface-500 leading-relaxed">
            Need help with your creator account? Contact our team.
          </p>
        </div>

        <a
          href="mailto:support@virgoplay.net"
          className="w-full flex items-center gap-3 py-3 px-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-primary-500/30 transition-colors group"
        >
          <div className="w-9 h-9 rounded-lg bg-primary-600/15 border border-primary-500/20 flex items-center justify-center flex-shrink-0">
            <Mail className="w-4 h-4 text-primary-300" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm text-surface-200 font-medium">Contact Support</div>
            <div className="text-[11px] text-surface-500 mt-0.5">support@virgoplay.net</div>
          </div>
          <ChevronRight className="w-4 h-4 text-surface-600 group-hover:text-primary-300 transition-colors flex-shrink-0" />
        </a>
      </div>
    </div>
  );
}
