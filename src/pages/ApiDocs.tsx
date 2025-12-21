import { Link } from "react-router-dom";
import { ArrowLeft, Copy, CheckCircle, Play, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

interface EndpointParam {
  name: string;
  type: string;
  description: string;
}

interface Endpoint {
  method: 'GET' | 'POST';
  path: string;
  table?: string;
  description: string;
  params: EndpointParam[];
  response: string;
}

const endpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/rest/v1/projects',
    table: 'projects',
    description: 'Haal alle projecten op',
    params: [
      { name: 'select', type: 'string', description: 'Kolommen om te selecteren (default: *)' },
      { name: 'is_active', type: 'boolean', description: 'Filter op actieve projecten' }
    ],
    response: `[
  {
    "id": "uuid",
    "name": "Project Naam",
    "project_key": "project-key",
    "basicall_project_id": 1001,
    "is_active": true,
    "hourly_rate": 35.00,
    "vat_rate": 21
  }
]`
  },
  {
    method: 'GET',
    path: '/rest/v1/call_records',
    table: 'call_records',
    description: 'Haal call records op met filters',
    params: [
      { name: 'project_id', type: 'uuid', description: 'Filter op project' },
      { name: 'beldatum', type: 'date', description: 'Filter op beldatum (gte/lte)' },
      { name: 'resultaat', type: 'string', description: 'Filter op resultaat' },
      { name: 'limit', type: 'number', description: 'Max aantal records (default: 10)' }
    ],
    response: `[
  {
    "id": "uuid",
    "project_id": "uuid",
    "beldatum": "2024-01-15",
    "beltijd": "14:30:00",
    "resultaat": "Sale",
    "gesprekstijd_sec": 180,
    "week_number": 3,
    "raw_data": { ... }
  }
]`
  },
  {
    method: 'GET',
    path: '/rest/v1/sync_logs',
    table: 'sync_logs',
    description: 'Haal synchronisatie logs op',
    params: [
      { name: 'project_id', type: 'uuid', description: 'Filter op project' },
      { name: 'status', type: 'string', description: 'Filter op status (success/failed/running)' },
      { name: 'limit', type: 'number', description: 'Max aantal logs (default: 10)' }
    ],
    response: `[
  {
    "id": "uuid",
    "project_id": "uuid",
    "started_at": "2024-01-15T10:00:00Z",
    "completed_at": "2024-01-15T10:05:00Z",
    "status": "success",
    "records_synced": 150,
    "error_message": null
  }
]`
  },
  {
    method: 'POST',
    path: '/functions/v1/sync-project',
    description: 'Trigger handmatige sync voor een project',
    params: [
      { name: 'project_id', type: 'uuid', description: 'Project ID om te synchroniseren (of project_key)' },
      { name: 'project_key', type: 'string', description: 'Project key als alternatief voor project_id' },
      { name: 'from_date', type: 'string', description: 'Start datum (optioneel, format: YYYY-MM-DD)' },
      { name: 'to_date', type: 'string', description: 'Eind datum (optioneel, format: YYYY-MM-DD)' }
    ],
    response: `{
  "success": true,
  "project_id": "uuid",
  "project_name": "Project Naam",
  "records_synced": 150,
  "sync_log_id": "uuid"
}`
  }
];

const codeExamples = {
  javascript: `// JavaScript/TypeScript met Supabase Client
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://tvsdbztjqksxybxjwtrf.supabase.co',
  'YOUR_ANON_KEY'
);

// Projecten ophalen
const { data: projects, error } = await supabase
  .from('projects')
  .select('*')
  .eq('is_active', true);

// Call records met filters
const { data: records } = await supabase
  .from('call_records')
  .select('*')
  .eq('project_id', projectId)
  .gte('beldatum', '2024-01-01')
  .order('beldatum', { ascending: false })
  .limit(100);`,

  curl: `# cURL voorbeelden

# Projecten ophalen
curl -X GET \\
  'https://tvsdbztjqksxybxjwtrf.supabase.co/rest/v1/projects?select=*&is_active=eq.true' \\
  -H "apikey: YOUR_ANON_KEY" \\
  -H "Authorization: Bearer YOUR_ANON_KEY"

# Call records met filter
curl -X GET \\
  'https://tvsdbztjqksxybxjwtrf.supabase.co/rest/v1/call_records?project_id=eq.UUID&beldatum=gte.2024-01-01' \\
  -H "apikey: YOUR_ANON_KEY" \\
  -H "Authorization: Bearer YOUR_ANON_KEY"

# Project sync triggeren
curl -X POST \\
  'https://tvsdbztjqksxybxjwtrf.supabase.co/functions/v1/sync-project' \\
  -H "Content-Type: application/json" \\
  -d '{"project_id": "YOUR_PROJECT_UUID"}'`,

  python: `# Python met supabase-py
from supabase import create_client

supabase = create_client(
    "https://tvsdbztjqksxybxjwtrf.supabase.co",
    "YOUR_ANON_KEY"
)

# Projecten ophalen
projects = supabase.table("projects") \\
    .select("*") \\
    .eq("is_active", True) \\
    .execute()

# Call records met filters
records = supabase.table("call_records") \\
    .select("*") \\
    .eq("project_id", project_id) \\
    .gte("beldatum", "2024-01-01") \\
    .order("beldatum", desc=True) \\
    .limit(100) \\
    .execute()`
};

interface TestResult {
  status: 'idle' | 'loading' | 'success' | 'error';
  data?: any;
  error?: string;
  duration?: number;
}

interface EndpointTesterProps {
  endpoint: Endpoint;
  index: number;
}

function EndpointTester({ endpoint, index }: EndpointTesterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [params, setParams] = useState<Record<string, string>>({});
  const [result, setResult] = useState<TestResult>({ status: 'idle' });

  const updateParam = (name: string, value: string) => {
    setParams(prev => ({ ...prev, [name]: value }));
  };

  const executeTest = async () => {
    setResult({ status: 'loading' });
    const startTime = performance.now();

    try {
      if (endpoint.method === 'GET' && endpoint.table) {
        const tableName = endpoint.table as 'projects' | 'call_records' | 'sync_logs';
        const limit = params.limit ? parseInt(params.limit) : 10;
        
        let data: any[] | null = null;
        let error: any = null;

        if (tableName === 'projects') {
          let query = supabase.from('projects').select('*');
          if (params.is_active === 'true') {
            query = query.eq('is_active', true);
          } else if (params.is_active === 'false') {
            query = query.eq('is_active', false);
          }
          const result = await query.limit(limit);
          data = result.data;
          error = result.error;
        } else if (tableName === 'call_records') {
          let query = supabase.from('call_records').select('*');
          if (params.project_id) {
            query = query.eq('project_id', params.project_id);
          }
          if (params.beldatum) {
            query = query.gte('beldatum', params.beldatum);
          }
          if (params.resultaat) {
            query = query.eq('resultaat', params.resultaat);
          }
          const result = await query.limit(limit);
          data = result.data;
          error = result.error;
        } else if (tableName === 'sync_logs') {
          let query = supabase.from('sync_logs').select('*');
          if (params.project_id) {
            query = query.eq('project_id', params.project_id);
          }
          if (params.status) {
            query = query.eq('status', params.status);
          }
          const result = await query.limit(limit);
          data = result.data;
          error = result.error;
        }

        const duration = Math.round(performance.now() - startTime);

        if (error) {
          setResult({ status: 'error', error: error.message, duration });
        } else {
          setResult({ status: 'success', data, duration });
        }
      } else if (endpoint.method === 'POST' && endpoint.path.includes('sync-project')) {
        // Use edge function for POST
        const body: Record<string, string> = {};
        if (params.project_id) body.project_id = params.project_id;
        if (params.project_key) body.project_key = params.project_key;
        if (params.from_date) body.from_date = params.from_date;
        if (params.to_date) body.to_date = params.to_date;

        const { data, error } = await supabase.functions.invoke('sync-project', {
          body,
        });

        const duration = Math.round(performance.now() - startTime);

        if (error) {
          setResult({ status: 'error', error: error.message, duration });
        } else {
          setResult({ status: 'success', data, duration });
        }
      }
    } catch (err) {
      const duration = Math.round(performance.now() - startTime);
      setResult({ 
        status: 'error', 
        error: err instanceof Error ? err.message : 'Onbekende fout',
        duration 
      });
    }
  };

  return (
    <div className="p-4 rounded-lg border bg-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Badge 
            variant="outline" 
            className={
              endpoint.method === 'GET' 
                ? 'bg-primary/10 text-primary' 
                : 'bg-kpi-orange text-kpi-orange-text'
            }
          >
            {endpoint.method}
          </Badge>
          <code className="font-mono text-sm">{endpoint.path}</code>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="gap-2"
        >
          <Play className="h-4 w-4" />
          Test
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>
      
      <p className="text-muted-foreground mb-4">{endpoint.description}</p>

      {/* Test Panel */}
      {isOpen && (
        <div className="mt-4 p-4 rounded-lg border bg-muted/30 space-y-4">
          <h5 className="text-sm font-medium">Test Parameters</h5>
          
          <div className="grid gap-3 md:grid-cols-2">
            {endpoint.params.map((param) => (
              <div key={param.name} className="space-y-1">
                <Label htmlFor={`${index}-${param.name}`} className="text-xs">
                  {param.name} <span className="text-muted-foreground">({param.type})</span>
                </Label>
                <Input
                  id={`${index}-${param.name}`}
                  placeholder={param.description}
                  value={params[param.name] || ''}
                  onChange={(e) => updateParam(param.name, e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            ))}
          </div>

          <Button 
            onClick={executeTest} 
            disabled={result.status === 'loading'}
            className="gap-2"
          >
            {result.status === 'loading' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Uitvoeren
          </Button>

          {/* Result */}
          {result.status !== 'idle' && result.status !== 'loading' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant={result.status === 'success' ? 'default' : 'destructive'}>
                  {result.status === 'success' ? '200 OK' : 'Error'}
                </Badge>
                {result.duration && (
                  <span className="text-xs text-muted-foreground">
                    {result.duration}ms
                  </span>
                )}
              </div>
              <ScrollArea className="h-[200px]">
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
                  {result.status === 'success' 
                    ? JSON.stringify(result.data, null, 2)
                    : result.error
                  }
                </pre>
              </ScrollArea>
            </div>
          )}
        </div>
      )}

      {/* Parameters Info (collapsed state) */}
      {!isOpen && endpoint.params.length > 0 && (
        <div className="mb-4">
          <h5 className="text-sm font-medium mb-2">Parameters</h5>
          <div className="space-y-2">
            {endpoint.params.map((param, pIdx) => (
              <div key={pIdx} className="flex items-start gap-2 text-sm">
                <code className="bg-muted px-1 rounded">{param.name}</code>
                <span className="text-muted-foreground">({param.type})</span>
                <span>- {param.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isOpen && (
        <div>
          <h5 className="text-sm font-medium mb-2">Response</h5>
          <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
            {endpoint.response}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function ApiDocs() {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link to="/developer">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground">API Documentatie</h1>
            <p className="text-muted-foreground">
              REST API referentie voor Triple Tree Dashboard
            </p>
          </div>
        </div>

        {/* Introduction */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Introductie</CardTitle>
            <CardDescription>
              De Triple Tree API is gebouwd op Supabase en biedt een RESTful interface
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 rounded-lg border bg-card">
                <h4 className="font-medium mb-2">Base URL</h4>
                <code className="text-sm bg-muted px-2 py-1 rounded">
                  https://tvsdbztjqksxybxjwtrf.supabase.co
                </code>
              </div>
              <div className="p-4 rounded-lg border bg-card">
                <h4 className="font-medium mb-2">Authenticatie</h4>
                <p className="text-sm text-muted-foreground">
                  API Key via <code className="bg-muted px-1 rounded">apikey</code> header
                </p>
              </div>
            </div>
            <div className="p-4 rounded-lg border bg-primary/10">
              <h4 className="font-medium mb-2 text-primary">🧪 Live Testing</h4>
              <p className="text-sm">
                Klik op <strong>Test</strong> bij elk endpoint om live API calls te maken 
                met de huidige authenticatie sessie.
              </p>
            </div>
            <div className="p-4 rounded-lg border bg-kpi-orange/50">
              <h4 className="font-medium mb-2 text-kpi-orange-text">⚠️ Belangrijk</h4>
              <p className="text-sm">
                Gebruik alleen de <strong>anon key</strong> voor client-side requests. 
                De <strong>service role key</strong> mag nooit in client code worden gebruikt.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Endpoints with Live Testing */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Endpoints</CardTitle>
            <CardDescription>Beschikbare API endpoints met live testing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {endpoints.map((endpoint, idx) => (
                <EndpointTester key={idx} endpoint={endpoint} index={idx} />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Code Examples */}
        <Card>
          <CardHeader>
            <CardTitle>Code Voorbeelden</CardTitle>
            <CardDescription>Implementatie voorbeelden in verschillende talen</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="javascript">
              <TabsList className="mb-4">
                <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                <TabsTrigger value="curl">cURL</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
              </TabsList>

              {Object.entries(codeExamples).map(([lang, code]) => (
                <TabsContent key={lang} value={lang}>
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(code, lang)}
                    >
                      {copiedCode === lang ? (
                        <CheckCircle className="h-4 w-4 text-primary" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <ScrollArea className="h-[400px]">
                      <pre className="bg-muted p-4 rounded-lg text-sm">
                        {code}
                      </pre>
                    </ScrollArea>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        {/* Future Webhooks */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Webhooks (Roadmap)</CardTitle>
            <CardDescription>Toekomstige webhook functionaliteit</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-4 rounded-lg border bg-muted/50">
              <p className="text-sm text-muted-foreground mb-4">
                Webhook ondersteuning is gepland voor een toekomstige release. Hiermee kun je:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                <li>Real-time notificaties ontvangen bij nieuwe call records</li>
                <li>Sync status updates ontvangen</li>
                <li>Custom integraties bouwen met externe systemen</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
