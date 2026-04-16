import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Smartphone, Monitor, CheckCircle2 } from "lucide-react";
import tripleTreeLogo from "@/assets/triple-tree-logo.png";

type Platform = "ios" | "android" | "desktop";

const PLATFORM_STEPS: Record<Platform, { title: string; steps: string[] }> = {
  ios: {
    title: "iPhone / iPad (Safari)",
    steps: [
      "Open app.ttcallcenters.nl in Safari.",
      "Tik op het deel-icoon onderaan het scherm.",
      "Kies 'Zet op beginscherm' uit het menu.",
      "Tik rechtsboven op 'Voeg toe'. De app staat nu op je beginscherm.",
    ],
  },
  android: {
    title: "Android (Chrome)",
    steps: [
      "Open app.ttcallcenters.nl in Chrome.",
      "Tik rechtsboven op het menu (drie puntjes).",
      "Kies 'App installeren' of 'Toevoegen aan startscherm'.",
      "Bevestig. Het Triple Tree-icoon staat nu tussen je apps.",
    ],
  },
  desktop: {
    title: "Desktop (Chrome / Edge)",
    steps: [
      "Open app.ttcallcenters.nl in Chrome of Edge.",
      "Klik in de adresbalk rechts op het installeer-icoon (een plus/computer).",
      "Klik op 'Installeren'.",
      "Het dashboard opent als losse app en krijgt een eigen icoon op je desktop.",
    ],
  },
};

export default function Welcome() {
  const navigate = useNavigate();
  const [platform, setPlatform] = useState<Platform>(() => {
    if (typeof navigator === "undefined") return "desktop";
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) return "ios";
    if (/Android/.test(ua)) return "android";
    return "desktop";
  });

  const guide = PLATFORM_STEPS[platform];

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center">
          <img src={tripleTreeLogo} alt="Triple Tree" className="h-14 mx-auto mb-6" />
          <h1 className="text-3xl font-bold mb-2">Welkom bij je Triple Tree dashboard</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Je account is geactiveerd. Voordat je begint: pin het dashboard op je telefoon of laptop,
            zodat het werkt als een eigen app — sneller openen, volledig scherm, en je hoeft de URL
            niet te onthouden.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Installeer de app</CardTitle>
            <CardDescription>
              Kies je apparaat. We hebben je platform automatisch gedetecteerd — pas aan als je ergens anders werkt.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={platform === "ios" ? "default" : "outline"}
                size="sm"
                onClick={() => setPlatform("ios")}
                className="gap-2"
              >
                <Smartphone className="h-4 w-4" /> iPhone / iPad
              </Button>
              <Button
                variant={platform === "android" ? "default" : "outline"}
                size="sm"
                onClick={() => setPlatform("android")}
                className="gap-2"
              >
                <Smartphone className="h-4 w-4" /> Android
              </Button>
              <Button
                variant={platform === "desktop" ? "default" : "outline"}
                size="sm"
                onClick={() => setPlatform("desktop")}
                className="gap-2"
              >
                <Monitor className="h-4 w-4" /> Desktop
              </Button>
            </div>

            <div className="rounded-lg border p-4 bg-muted/30">
              <h3 className="font-semibold mb-3">{guide.title}</h3>
              <ol className="space-y-2">
                {guide.steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex items-start gap-2 text-xs text-muted-foreground pt-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
              <span>
                Je kan deze stap overslaan — het dashboard werkt ook gewoon in je browser. Installeren
                maakt het alleen handiger.
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center">
          <Button size="lg" onClick={() => navigate("/dashboard")} className="gap-2">
            Naar het dashboard
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
