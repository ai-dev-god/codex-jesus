import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Dna, Upload, Shield, Lock } from 'lucide-react';

const providers = [
  { id: '23andme', name: '23andMe', supported: true },
  { id: 'ancestry', name: 'AncestryDNA', supported: true },
  { id: 'myheritage', name: 'MyHeritage', supported: true },
  { id: 'nebula', name: 'Nebula Genomics', supported: true },
];

export default function GeneticUpload() {
  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h3>Genetic Data</h3>
          <Badge variant="secondary" className="text-xs">OPTIONAL</Badge>
        </div>
        <p className="text-steel">
          Upload your genetic data for personalized insights on nutrition, supplements, 
          and health optimization based on your unique genetic profile.
        </p>
      </div>

      <div className="neo-card-neural p-8">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl gradient-neural flex items-center justify-center flex-shrink-0">
            <Dna className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1">
            <h4 className="mb-3">Why Add Genetic Data?</h4>
            <ul className="space-y-2 text-sm text-steel">
              <li className="flex items-start gap-2">
                <span className="text-neural mt-0.5">•</span>
                <span>Personalized supplement recommendations based on methylation genes</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-neural mt-0.5">•</span>
                <span>Optimized nutrition protocols for your genetic variants</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-neural mt-0.5">•</span>
                <span>Exercise response predictions and training optimization</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-neural mt-0.5">•</span>
                <span>Early risk assessment for age-related conditions</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div>
        <h4 className="mb-4">Supported Providers</h4>
        <div className="grid grid-cols-2 gap-3">
          {providers.map((provider) => (
            <button key={provider.id} className="neo-card p-5 text-center hover:scale-105 transition-transform">
              <p className="font-semibold text-ink mb-2">{provider.name}</p>
              {provider.supported && (
                <Badge variant="success" className="text-xs">
                  SUPPORTED
                </Badge>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="border-2 border-dashed border-cloud rounded-2xl p-10 text-center hover:border-neural hover:bg-neural/5 transition-all">
        <div className="w-16 h-16 rounded-2xl bg-neural/10 flex items-center justify-center mx-auto mb-4">
          <Upload className="w-8 h-8 text-neural" />
        </div>
        <p className="font-semibold text-ink mb-2">Upload your raw genetic data</p>
        <p className="text-sm text-steel mb-6">
          We accept .txt, .zip, and .csv files from major providers
        </p>
        <Button variant="outline">
          Select File
        </Button>
      </div>

      <div className="p-6 rounded-xl bg-electric/5 border-2 border-electric/20">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-electric/20 flex items-center justify-center flex-shrink-0">
            <Shield className="w-6 h-6 text-electric" />
          </div>
          <div>
            <p className="font-semibold text-ink mb-3">Privacy & Security</p>
            <div className="space-y-2 text-sm text-steel">
              <div className="flex items-center gap-3">
                <Lock className="w-4 h-4 text-electric" />
                <span>256-bit encryption at rest and in transit</span>
              </div>
              <div className="flex items-center gap-3">
                <Lock className="w-4 h-4 text-electric" />
                <span>HIPAA compliant storage</span>
              </div>
              <div className="flex items-center gap-3">
                <Lock className="w-4 h-4 text-electric" />
                <span>You control your data - delete anytime</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
