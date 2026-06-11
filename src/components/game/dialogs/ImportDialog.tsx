import { Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importString: string;
  setImportString: (value: string) => void;
  importError: string;
  setImportError: (value: string) => void;
  onImport: () => void;
}

export function ImportDialog({
  open,
  onOpenChange,
  importString,
  setImportString,
  importError,
  setImportError,
  onImport,
}: ImportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-brand/30 text-subtle max-w-lg w-[calc(100%-1rem)] lg:w-full max-h-[90vh] lg:max-h-none p-4 lg:p-6">
        <DialogHeader>
          <DialogTitle className="text-brand flex items-center gap-2 text-sm lg:text-base">
            <Upload className="w-4 h-4" /> Import Save
          </DialogTitle>
          <DialogDescription className="text-subtle text-xs lg:text-sm">
            Paste your save data below to restore progress. This will overwrite your current game!
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            value={importString}
            onChange={(e) => {
              setImportString(e.target.value);
              setImportError('');
            }}
            placeholder="Paste your save string here..."
            className="bg-[#0a0e17] border-brand/20 text-xs font-mono text-subtle min-h-24 lg:min-h-32 max-h-36 lg:max-h-48 game-scrollbar placeholder:text-muted-label"
          />
          {importError && (
            <p className="text-xs text-danger flex items-center gap-1">
              <X className="w-3 h-3" /> {importError}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              onClick={onImport}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white min-h-[44px] lg:min-h-0"
              size="sm"
            >
              <Upload className="w-3.5 h-3.5 mr-1" /> Import Save
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                setImportError('');
              }}
              className="border-muted-label text-subtle hover:text-subtle min-h-[44px] lg:min-h-0"
              size="sm"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
