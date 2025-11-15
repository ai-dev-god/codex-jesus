import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Upload, FileText, CheckCircle2, X } from 'lucide-react';
import { useState } from 'react';

interface UploadedFile {
  id: string;
  name: string;
  size: string;
  type: string;
  status: 'uploading' | 'processing' | 'complete';
}

export default function LabUpload() {
  const [files, setFiles] = useState<UploadedFile[]>([]);

  const handleFileUpload = () => {
    const newFile: UploadedFile = {
      id: Date.now().toString(),
      name: 'blood_panel_nov_2025.pdf',
      size: '2.3 MB',
      type: 'PDF',
      status: 'uploading',
    };
    
    setFiles([...files, newFile]);

    setTimeout(() => {
      setFiles(prev => prev.map(f => 
        f.id === newFile.id ? { ...f, status: 'processing' } : f
      ));
    }, 1000);

    setTimeout(() => {
      setFiles(prev => prev.map(f => 
        f.id === newFile.id ? { ...f, status: 'complete' } : f
      ));
    }, 2500);
  };

  const removeFile = (id: string) => {
    setFiles(files.filter(f => f.id !== id));
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
          <Button onClick={handleFileUpload} size="lg">
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
                    <span>{file.size}</span>
                    <span>•</span>
                    {file.status === 'uploading' && (
                      <span className="text-electric font-semibold">Uploading...</span>
                    )}
                    {file.status === 'processing' && (
                      <span className="text-neural font-semibold">Processing with AI...</span>
                    )}
                    {file.status === 'complete' && (
                      <span className="text-bio font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Complete
                      </span>
                    )}
                  </div>
                  {file.status === 'complete' && (
                    <Badge variant="success" className="text-xs">
                      Extracted 47 biomarkers
                    </Badge>
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
