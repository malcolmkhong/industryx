import { Check, Copy, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exportString: string;
  onCopy: () => void;
  copiedToClipboard: boolean;
}

export function ExportDialog({
  open,
  onOpenChange,
  exportString,
  onCopy,
  copiedToClipboard,
}: ExportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-cyan-900/30 text-gray-100 max-w-lg w-[calc(100%-1rem)] lg:w-full max-h-[90vh] lg:max-h-none p-4 lg:p-6">
        <DialogHeader>
          <DialogTitle className="text-cyan-400 flex items-center gap-2 text-sm lg:text-base">
            <Download className="w-4 h-4" /> Export Save
          </DialogTitle>
          <DialogDescription className="text-subtle text-xs lg:text-sm">
            Copy your save data below to back up your progress or transfer to another device.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            readOnly
            value={exportString}
            className="bg-[#0a0e17] border-cyan-900/20 text-xs font-mono text-subtle min-h-24 lg:min-h-32 max-h-36 lg:max-h-48 game-scrollbar"
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
          />
          <div className="flex items-center gap-2">
            <Button
              onClick={onCopy}
              className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white min-h-[44px] lg:min-h-0"
              size="sm"
            >
              {copiedToClipboard ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 mr-1" /> Copy to Clipboard
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-muted-label text-subtle hover:text-gray-200 min-h-[44px] lg:min-h-0"
              size="sm"
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
