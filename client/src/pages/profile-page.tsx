import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MapPin, Calendar, Plus, MoreHorizontal, Edit2, Music2, TrendingUp } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

export default function ProfilePage() {
  return (
    <Layout>
      <div className="min-h-screen bg-background pb-20">
        {/* Cover Image */}
        <div className="h-64 md:h-80 bg-primary relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1507838153414-b4b713384ebd?q=80&w=2670&auto=format&fit=crop')] bg-cover bg-center opacity-40"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent"></div>
        </div>

        <div className="container mx-auto px-4 -mt-32 relative z-10">
          <div className="flex flex-col md:flex-row items-end gap-6 mb-8">
            <Avatar className="w-40 h-40 border-4 border-background shadow-2xl">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback className="text-4xl font-serif">EC</AvatarFallback>
            </Avatar>
            
            <div className="flex-1 pb-4 text-center md:text-left">
              <h1 className="font-serif text-4xl font-bold text-primary mb-2">Elena Corvin</h1>
              <div className="flex flex-col md:flex-row items-center gap-4 text-muted-foreground mb-4">
                <span className="flex items-center gap-1 font-medium"><span className="text-accent-foreground">Violin</span> • Professional</span>
                <span className="hidden md:inline">•</span>
                <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> Vienna, Austria</span>
              </div>
            </div>

            <div className="pb-4 flex gap-3">
              <Link href="/insights">
                <Button variant="outline" className="bg-background/50 backdrop-blur-sm">
                  <TrendingUp className="w-4 h-4 mr-2" /> Artistic Insights
                </Button>
              </Link>
              <Button>Connect</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="space-y-6 lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-serif">About</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">
                    Orchestral violinist and chamber musician based in Vienna. 
                    Graduate of the Vienna Conservatory. Passionate about late Romantic repertoire 
                    and contemporary Austrian composers.
                  </p>
                </CardContent>
              </Card>

               <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-serif">Upcoming</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4 items-start">
                    <div className="bg-primary/10 text-primary p-2 rounded text-center min-w-[3.5rem]">
                      <div className="text-xs uppercase font-bold">Mar</div>
                      <div className="text-xl font-bold">12</div>
                    </div>
                    <div>
                      <h4 className="font-medium">Chamber Recital</h4>
                      <p className="text-sm text-muted-foreground">Mozarthaus Vienna</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-3">
              <Tabs defaultValue="all" className="w-full">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <Music2 className="w-6 h-6 text-primary" />
                    <h2 className="font-serif text-2xl font-bold">Repertoire</h2>
                  </div>
                  <TabsList className="bg-background border">
                    <TabsTrigger value="all">All Pieces</TabsTrigger>
                    <TabsTrigger value="active">Active</TabsTrigger>
                    <TabsTrigger value="performance">Ready</TabsTrigger>
                  </TabsList>
                </div>

                <Card className="border-none shadow-sm overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead>Composer</TableHead>
                        <TableHead>Piece</TableHead>
                        <TableHead>Movement</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Started</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <RepertoireRow 
                        composer="Johannes Brahms"
                        piece="Violin Sonata No. 3 in D minor"
                        movement="I. Allegro"
                        status="Performance-ready"
                        date="2023-09-15"
                        id="brahms-sonata-3"
                      />
                      <RepertoireRow 
                        composer="J.S. Bach"
                        piece="Partita No. 2 in D minor"
                        movement="V. Chaconne"
                        status="In Progress"
                        date="2024-01-10"
                        id="bach-partita-2"
                      />
                    </TableBody>
                  </Table>
                </Card>
              </Tabs>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function RepertoireRow({ composer, piece, movement, status, date, id }: { composer: string, piece: string, movement: string, status: string, date: string, id: string }) {
  const getStatusColor = (s: string) => {
    switch(s) {
      case "Performance-ready": return "bg-green-100 text-green-700 border-green-200";
      case "In Progress": return "bg-blue-100 text-blue-700 border-blue-200";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <TableRow className="group hover:bg-muted/20 transition-colors cursor-pointer">
      <TableCell className="font-semibold text-primary">
        <Link href={`/piece/${id}`}>{composer}</Link>
      </TableCell>
      <TableCell className="font-serif italic">
        <Link href={`/piece/${id}`}>{piece}</Link>
      </TableCell>
      <TableCell className="text-muted-foreground">{movement}</TableCell>
      <TableCell>
        <Badge variant="outline" className={cn("font-medium", getStatusColor(status))}>
          {status}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{date}</TableCell>
    </TableRow>
  );
}
