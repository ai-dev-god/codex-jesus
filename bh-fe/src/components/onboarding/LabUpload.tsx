import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Upload, FileText, CheckCircle2, X, AlertTriangle } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';

import { useAuth } from '../../lib/auth/AuthContext';
import { createPanelUploadSession, recordPanelUpload } from '../../lib/api/ai';
import { ApiError } from '../../lib/api/error';

type UploadStatus = 'hashing' | 'signing' | 'uploading' | 'registering' | 'complete' | 'error';

interface UploadedFile {
  id: string;
  name: string;
  sizeLabel: string;
  type: string;
  status: UploadStatus;
  hash?: string;
  error?: string;
}

interface LabUploadProps {
  onUploadComplete?: (fileName: string) => void;
}

const formatFileSize = (size: number): string => {
  if (size === 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** index;
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
};

export default function LabUpload({ onUploadComplete }: LabUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { ensureAccessToken } = useAuth();

  const handleFileSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files;
    if (!selected || selected.length === 0) {
      return;
    }

    const uploads = Array.from(selected);
    event.target.value = '';

    for (const file of uploads) {
      // eslint-disable-next-line no-await-in-loop
      await uploadFile(file);
    }
  };

  const uploadFile = async (file: File) => {
    const id = `${Date.now()}-${file.name}`;
    const entry: UploadedFile = {
      id,
      name: file.name,
      sizeLabel: formatFileSize(file.size),
      type: file.type || 'File',
      status: 'hashing'
    };
    setFiles((prev) => [entry, ...prev]);

    try {
      const token = await ensureAccessToken();
      const sha256 = await computeFileSha256(file);
      updateFile(id, { status: 'signing', hash: sha256 });

      const session = await createPanelUploadSession(token, {
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        byteSize: file.size,
        sha256
      });

      updateFile(id, { status: 'uploading' });
      await uploadToSignedUrl(session.uploadUrl, session.requiredHeaders, file);

      updateFile(id, { status: 'registering' });
      await recordPanelUpload(token, {
        sessionId: session.sessionId,
        storageKey: session.storageKey,
        contentType: file.type || 'application/octet-stream',
        rawMetadata: {
          fileName: file.name,
          size: file.size,
          lastModified: file.lastModified,
          sha256
        }
      });

      setFiles((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: 'complete' } : item))
      );
      toast.success(`${file.name} uploaded successfully.`);
      onUploadComplete?.(file.name);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Unable to upload this file.';
      updateFile(id, {
        status: 'error',
        error: message
      });
      toast.error(message);
    }
  };

  const computeFileSha256 = async (file: File): Promise<string> => {
    if (typeof window === 'undefined' || !window.crypto?.subtle) {
      throw new ApiError('Secure hashing is unavailable in this environment.', 500, 'LAB_UPLOAD_HASH_UNAVAILABLE');
    }
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
  };

  const uploadToSignedUrl = async (url: string, headers: Record<string, string>, file: File): Promise<void> => {
    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: file
    });
    if (!response.ok) {
      const text = await response.text();
      throw new ApiError('Signed upload failed', response.status, 'LAB_UPLOAD_SIGNED_URL_FAILED', text);
    }
  };

  const updateFile = (id: string, patch: Partial<UploadedFile>) => {
    setFiles((prev) =>
      prev.map((file) => (file.id === id ? { ...file, ...patch, error: patch.error ?? file.error } : file))
    );
  };

  const handleFilePickerClick = () => {
    fileInputRef.current?.click();
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-2">Upload Lab Results</h3>
        <p className="text-steel">
          Upload your lab results, blood panels, or genetic tests. Our AI will automatically 
          parse and structure 150+ biomarkers for longitudinal tracking.
        </p>
      </div>

      <div className="border-2 border-dashed border-cloud rounded-2xl p-12 text-center hover:border-electric hover:bg-electric/5 transition-all cursor-pointer">
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-2xl gradient-electric flex items-center justify-center">
            <Upload className="w-10 h-10 text-void" />
          </div>
          <div>
            <p className="font-semibold text-ink mb-1">Drop files here or click to upload</p>
            <p className="text-sm text-steel">
              Supports PDF, CSV, JPG, PNG (max 10MB)
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.csv,.jpg,.jpeg,.png"
            multiple
            className="hidden"
            onChange={handleFileSelection}
          />
          <Button onClick={handleFilePickerClick} size="lg">
            Choose Files
          </Button>
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-3">
          <h4>Uploaded Files</h4>
          {files.map((file) => (
            <div key={file.id} className="neo-card p-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-electric/10 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-electric" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <p className="font-semibold text-ink truncate">{file.name}</p>
                    <button
                      onClick={() => removeFile(file.id)}
                      className="text-steel hover:text-pulse transition-colors flex-shrink-0"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-steel mb-2">
                    <span>{file.type}</span>
                    <span>•</span>
                    <span>{file.sizeLabel}</span>
                    <span>•</span>
                    {file.status === 'hashing' && <span className="text-electric font-semibold">Hashing…</span>}
                    {file.status === 'signing' && (
                      <span className="text-electric font-semibold">Securing channel…</span>
                    )}
                    {file.status === 'uploading' && (
                      <span className="text-electric font-semibold">Uploading…</span>
                    )}
                    {file.status === 'registering' && (
                      <span className="text-electric font-semibold">Verifying integrity…</span>
                    )}
                    {file.status === 'complete' && (
                      <span className="text-bio font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Uploaded
                      </span>
                    )}
                    {file.status === 'error' && (
                      <span className="text-pulse font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Failed
                      </span>
                    )}
                  </div>
                  {file.status === 'complete' && (
                    <Badge variant="success" className="text-xs">
                      Synced to BioHax AI
                    </Badge>
                  )}
                  {file.status === 'error' && file.error && (
                    <p className="text-xs text-pulse">{file.error}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="p-6 rounded-xl bg-pearl border-2 border-cloud">
        <p className="font-semibold text-ink mb-4">Supported Biomarkers</p>
        <div className="flex flex-wrap gap-2">
          {['Glucose', 'HbA1c', 'Cholesterol', 'HDL/LDL', 'Triglycerides', 'Vitamin D', 'Testosterone', 'Cortisol', 'CRP', 'Homocysteine', '+140 more'].map((marker) => (
            <span
              key={marker}
              className="px-3 py-1.5 bg-white rounded-lg text-xs font-semibold text-steel border border-cloud"
            >
              {marker}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
