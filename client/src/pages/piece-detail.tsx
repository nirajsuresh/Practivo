import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Music2, Calendar, Clock, Link as LinkIcon, Plus, ChevronDown, ChevronUp, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

export default function PieceDetailPage() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [status, setStatus] = useState("Performance-ready");
  const [notes, setNotes] = useState([
    { id: 1, date: "2024-02-01", time: "1.5", content: "Focused on the intonation in the opening G string passage. Needs more vibrato variety.", media: "https://vimeo.com/..." },
    { id: 2, date: "2024-01-28", time: "2.0", content: "Worked on the double stops in the development section. Metronome at 60bpm.", media: "" }
  ]);

  const getStatusColor = (s: string) => {
    switch(s) {
      case "Performance-ready": return "bg-green-100 text-green-700 border-green-200";
      case "In Progress": return "bg-blue-100 text-blue-700 border-blue-200";
      case "Learned": return "bg-amber-100 text-amber-700 border-amber-200";
      case "Wishlist": return "bg-slate-100 text-slate-600 border-slate-200";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-background py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <Link href="/profile">
            <Button variant="ghost" size="sm" className="mb-8 group">
              <ArrowLeft className="w-4 h-4 mr-2 transition-transform group-hover:-translate-x-1" />
              Back to Profile
            </Button>
          </Link>

          <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Music2 className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h1 className="font-serif text-4xl font-bold">Violin Sonata No. 3 in D minor</h1>
                <p className="text-xl text-muted-foreground font-serif italic">Johannes Brahms, Op. 108</p>
              </div>
            </div>
            
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Status</span>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className={cn("h-10 w-[200px] font-medium transition-colors", getStatusColor(status))}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Wishlist">Wishlist</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Learned">Learned</SelectItem>
                  <SelectItem value="Performance-ready">Performance-ready</SelectItem>
                  <SelectItem value="Re-learning">Re-learning</SelectItem>
                  <SelectItem value="Stopped learning">Stopped learning</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card className="mb-8 border-none shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/30 pb-4 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-serif">Historical Context & Analysis</CardTitle>
                <Button variant="ghost" size="sm">
                  {isExpanded ? <ChevronUp /> : <ChevronDown />}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className={isExpanded ? "" : "line-clamp-3"}>
                <p className="text-muted-foreground leading-relaxed">
                  The Violin Sonata No. 3 in D minor, Op. 108, by Johannes Brahms was composed between 1886 and 1888. 
                  Unlike his previous two sonatas, this one has four movements instead of three. It is dedicated to 
                  his friend and colleague Hans von Bülow. The work is characterized by its dramatic intensity and 
                  virtuosic writing for both instruments. The third movement, 'Un poco presto e con sentimento', 
                  is particularly noted for its syncopated rhythms and shifting moods.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl font-bold">Practice Log</h2>
              <Button size="sm" className="gap-2">
                <Plus className="w-4 h-4" /> Add Session
              </Button>
            </div>

            <Card className="border-none shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time (Hrs)</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Media</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notes.map((note) => (
                    <TableRow key={note.id}>
                      <TableCell className="font-medium">{note.date}</TableCell>
                      <TableCell>{note.time}</TableCell>
                      <TableCell className="max-w-md text-sm leading-relaxed">{note.content}</TableCell>
                      <TableCell>
                        {note.media ? (
                          <a href={note.media} target="_blank" className="text-primary hover:underline flex items-center gap-1">
                            <LinkIcon className="w-3 h-3" /> Link
                          </a>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <Card className="border-none shadow-sm bg-accent/5">
              <CardHeader>
                <CardTitle className="text-lg">New Practice Session</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" />
                  </div>
                  <div className="space-y-2">
                    <Label>Duration (hours)</Label>
                    <Input type="number" step="0.5" placeholder="1.5" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Practice Notes</Label>
                  <Textarea placeholder="What did you focus on today?" className="min-h-[100px]" />
                </div>
                <div className="space-y-2">
                  <Label>Media Link (Optional)</Label>
                  <Input placeholder="https://..." />
                </div>
                <Button className="w-full">Save Entry</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-medium leading-none">{children}</label>;
}
