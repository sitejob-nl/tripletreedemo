import { Link } from "react-router-dom";
import { ArrowLeft, Copy, CheckCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

const endpoints = [
  {
    method: 'GET',
    path: '/rest/v1/projects',
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
    description: 'Haal call records op met filters',
    params: [
      { name: 'project_id', type: 'uuid', description: 'Filter op project' },
      { name: 'beldatum', type: 'date', description: 'Filter op beldatum (gte/lte)' },
      { name: 'resultaat', type: 'string', description: 'Filter op resultaat' }
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
    description: 'Haal synchronisatie logs op',
    params: [
      { name: 'project_id', type: 'uuid', description: 'Filter op project' },
      { name: 'status', type: 'string', description: 'Filter op status (completed/failed/running)' }
    ],
    response: `[
  {
    "id": "uuid",
    "project_id": "uuid",
    "started_at": "2024-01-15T10:00:00Z",
    "completed_at": "2024-01-15T10:05:00Z",
    "status": "completed",
    "records_synced": 150,
    "error_message": null
  }
]`
  },
  {
    method: 'POST',
    path: '/functions/v1/sync-project',
    description: 'Trigger handmatige sync voor een project (toekomstig)',
    params: [
      { name: 'project_id', type: 'uuid', description: 'Project ID om te synchroniseren', required: true }
    ],
    response: `{
  "success": true,
  "message": "Sync gestart",
  "sync_id": "uuid"
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
  -H "Authorization: Bearer YOUR_ANON_KEY"`,

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
            <div className="p-4 rounded-lg border bg-kpi-orange/50">
              <h4 className="font-medium mb-2 text-kpi-orange-text">⚠️ Belangrijk</h4>
              <p className="text-sm">
                Gebruik alleen de <strong>anon key</strong> voor client-side requests. 
                De <strong>service role key</strong> mag nooit in client code worden gebruikt.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Endpoints */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Endpoints</CardTitle>
            <CardDescription>Beschikbare API endpoints</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {endpoints.map((endpoint, idx) => (
                <div key={idx} className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-3 mb-3">
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
                  <p className="text-muted-foreground mb-4">{endpoint.description}</p>
                  
                  {endpoint.params.length > 0 && (
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

                  <div>
                    <h5 className="text-sm font-medium mb-2">Response</h5>
                    <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
                      {endpoint.response}
                    </pre>
                  </div>
                </div>
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
