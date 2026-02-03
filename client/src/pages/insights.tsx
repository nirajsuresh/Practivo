import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { BookOpen, Sparkles, Trophy } from "lucide-react";

const genreData = [
  { genre: "Baroque", value: 40 },
  { genre: "Classical", value: 65 },
  { genre: "Romantic", value: 90 },
  { genre: "Impressionistic", value: 30 },
  { genre: "Modern", value: 50 },
];

const lengthData = [
  { name: "0-5m", count: 4 },
  { name: "5-10m", count: 8 },
  { name: "10-20m", count: 12 },
  { name: "20-30m", count: 5 },
  { name: "30m+", count: 2 },
];

export default function InsightsPage() {
  return (
    <Layout>
      <div className="min-h-screen bg-background py-12">
        <div className="container mx-auto px-4">
          <h1 className="font-serif text-4xl font-bold mb-8">Artistic Insights</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="font-serif text-xl">Genre Representation</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={genreData}>
                    <PolarGrid stroke="#e5e5e5" />
                    <PolarAngleAxis dataKey="genre" tick={{ fill: "#666", fontSize: 12 }} />
                    <Radar
                      name="Repertoire"
                      dataKey="value"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.4}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="font-serif text-xl">Piece Length Distribution</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={lengthData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <h2 className="font-serif text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-accent-foreground" />
              Rounding Out Your Repertoire
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <SuggestionCard 
                composer="Maurice Ravel"
                title="Tzigane"
                reason="Your repertoire is heavily Romantic. Adding an Impressionistic showpiece would show versatility."
              />
              <SuggestionCard 
                composer="J.S. Bach"
                title="Sonata No. 1 in G minor"
                reason="Adding a polyphonic Baroque work will balance your current focus on D minor works."
              />
              <SuggestionCard 
                composer="Béla Bartók"
                title="Violin Concerto No. 2"
                reason="A major 20th-century concerto would elevate your profile for international competitions."
              />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function SuggestionCard({ composer, title, reason }: { composer: string, title: string, reason: string }) {
  return (
    <Card className="border-none shadow-sm hover:translate-y-[-4px] transition-transform">
      <CardContent className="pt-6">
        <p className="text-xs font-bold uppercase tracking-widest text-accent-foreground mb-1">{composer}</p>
        <h3 className="font-serif text-xl font-bold mb-3">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{reason}</p>
      </CardContent>
    </Card>
  );
}
