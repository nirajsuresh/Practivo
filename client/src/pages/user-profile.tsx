import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MapPin, Music2, ChevronDown, ChevronUp, UserPlus, Clock, Check, X, Lock } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { getStatusColor } from "@/lib/status-colors";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface UserProfile {
  id: number;
  userId: string;
  displayName: string;
  instrument: string | null;
  level: string | null;
  location: string | null;
  bio: string | null;
  avatarUrl: string | null;
}

interface RepertoireEntry {
  id: number;
  composerName: string;
  pieceTitle: string;
  movementName: string | null;
  status: string;
  startedDate: string | null;
}

interface ConnectionStatus {
  status: "none" | "pending_sent" | "pending_received" | "accepted" | "denied";
  connectionId?: number;
}

export default function UserProfilePage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);

  const currentUserId = localStorage.getItem("userId");

  if (currentUserId && currentUserId === id) {
    setLocation("/profile");
    return null;
  }

  const { data: profile, isLoading: profileLoading } = useQuery<UserProfile>({
    queryKey: [`/api/users/${id}/profile`],
    enabled: !!id,
  });

  const { data: connectionStatus, isLoading: statusLoading } = useQuery<ConnectionStatus>({
    queryKey: [`/api/connections/status/${id}`],
    enabled: !!id && !!currentUserId,
  });

  const isConnected = connectionStatus?.status === "accepted";

  const { data: repertoire = [] } = useQuery<RepertoireEntry[]>({
    queryKey: [`/api/repertoire/${id}`],
    enabled: !!id && isConnected,
  });

  const sendRequest = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/connections", { recipientId: id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/connections/status/${id}`] });
      toast({ title: "Connection request sent" });
    },
    onError: () => {
      toast({ title: "Failed to send request", variant: "destructive" });
    },
  });

  const respondMutation = useMutation({
    mutationFn: async (status: "accepted" | "denied") => {
      await apiRequest("PATCH", `/api/connections/${connectionStatus?.connectionId}`, { status });
    },
    onSuccess: (_, status) => {
      queryClient.invalidateQueries({ queryKey: [`/api/connections/status/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/connections/received"] });
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      toast({ title: status === "accepted" ? "Connection accepted" : "Request declined" });
    },
    onError: () => {
      toast({ title: "Failed to update request", variant: "destructive" });
    },
  });

  const visibleRepertoire = isExpanded ? repertoire : repertoire.slice(0, 5);

  if (profileLoading || statusLoading) {
    return (
      <Layout>
        <div className="min-h-screen bg-background pb-20">
          <div className="h-64 md:h-80 bg-[#d4967c]" />
          <div className="container mx-auto px-4 -mt-32 relative z-10">
            <div className="flex flex-col md:flex-row items-end gap-6 mb-8">
              <Skeleton className="w-40 h-40 rounded-full" />
              <div className="flex-1 pb-4 space-y-3">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-5 w-48" />
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!profile) {
    return (
      <Layout>
        <div className="p-20 text-center font-serif italic" data-testid="text-user-not-found">User not found.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-background pb-20">
        <div className="h-64 md:h-80 bg-[#d4967c] relative overflow-hidden" />

        <div className="container mx-auto px-4 -mt-32 relative z-10">
          <div className="flex flex-col md:flex-row items-end gap-6 mb-8">
            <Avatar className="w-40 h-40 border-4 border-background shadow-2xl">
              <AvatarImage src={profile.avatarUrl || undefined} />
              <AvatarFallback className="text-4xl font-serif">
                {profile.displayName.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 pb-4 text-center md:text-left">
              <h1 className="font-serif text-4xl font-bold text-primary mb-2" data-testid="text-profile-name">
                {profile.displayName}
              </h1>
              <div className="flex flex-col md:flex-row items-center gap-4 text-muted-foreground mb-4">
                <span className="flex items-center gap-1 font-medium">
                  {profile.instrument && <span className="text-accent-foreground">{profile.instrument}</span>}
                  {profile.instrument && profile.level && ' • '}
                  {profile.level}
                </span>
                {profile.location && (
                  <>
                    <span className="hidden md:inline">•</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" /> {profile.location}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="pb-4 flex gap-3">
              {connectionStatus?.status === "none" || connectionStatus?.status === "denied" ? (
                <Button
                  onClick={() => sendRequest.mutate()}
                  disabled={sendRequest.isPending}
                  data-testid="button-connect"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Connect
                </Button>
              ) : connectionStatus?.status === "pending_sent" ? (
                <Button variant="outline" disabled data-testid="button-pending">
                  <Clock className="w-4 h-4 mr-2" />
                  Request Pending
                </Button>
              ) : connectionStatus?.status === "pending_received" ? (
                <div className="flex gap-2">
                  <Button
                    onClick={() => respondMutation.mutate("accepted")}
                    disabled={respondMutation.isPending}
                    data-testid="button-accept"
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Accept
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => respondMutation.mutate("denied")}
                    disabled={respondMutation.isPending}
                    data-testid="button-deny"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Deny
                  </Button>
                </div>
              ) : connectionStatus?.status === "accepted" ? (
                <Button variant="outline" disabled data-testid="button-connected">
                  <Check className="w-4 h-4 mr-2" />
                  Connected
                </Button>
              ) : null}
            </div>
          </div>

          {isConnected ? (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              <div className="space-y-6 lg:col-span-1">
                {profile.bio && (
                  <Card>
                    <CardHeader><CardTitle className="text-lg font-serif">About</CardTitle></CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground leading-relaxed" data-testid="text-profile-bio">{profile.bio}</p>
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="lg:col-span-3">
                <div className="flex items-center gap-4 mb-6">
                  <Music2 className="w-6 h-6 text-primary" />
                  <h2 className="font-serif text-2xl font-bold">Repertoire</h2>
                  <span className="text-sm text-muted-foreground">({repertoire.length} pieces)</span>
                </div>

                {repertoire.length === 0 ? (
                  <div className="text-center py-12 bg-muted/20 rounded-lg" data-testid="text-no-repertoire">
                    <p className="text-muted-foreground italic">No repertoire entries yet</p>
                  </div>
                ) : (
                  <>
                    <Card className="border-none shadow-sm overflow-hidden mb-4">
                      <Table>
                        <TableHeader className="bg-muted/30">
                          <TableRow>
                            <TableHead>Composer</TableHead>
                            <TableHead>Piece</TableHead>
                            <TableHead>Movement</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleRepertoire.map((item) => (
                            <TableRow key={item.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-repertoire-${item.id}`}>
                              <TableCell className="font-semibold text-primary">{item.composerName}</TableCell>
                              <TableCell className="font-serif italic">{item.pieceTitle}</TableCell>
                              <TableCell className="text-muted-foreground text-xs">{item.movementName || '—'}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`font-medium border shadow-none ${getStatusColor(item.status)}`}>
                                  {item.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Card>

                    {repertoire.length > 5 && (
                      <div className="flex justify-center">
                        <Button variant="ghost" onClick={() => setIsExpanded(!isExpanded)} className="text-primary gap-2" data-testid="button-toggle-repertoire">
                          {isExpanded ? <>Show Less <ChevronUp className="w-4 h-4" /></> : <>View Full Repertoire <ChevronDown className="w-4 h-4" /></>}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-lg mx-auto text-center py-16">
              <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
                <Lock className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="font-serif text-2xl font-bold mb-3" data-testid="text-connect-prompt">
                Connect with {profile.displayName}
              </h2>
              <p className="text-muted-foreground mb-6" data-testid="text-connect-description">
                Connect to see their full profile, bio, and repertoire.
              </p>
              {connectionStatus?.status === "none" || connectionStatus?.status === "denied" ? (
                <Button
                  size="lg"
                  onClick={() => sendRequest.mutate()}
                  disabled={sendRequest.isPending}
                  data-testid="button-connect-large"
                >
                  <UserPlus className="w-5 h-5 mr-2" />
                  Send Connection Request
                </Button>
              ) : connectionStatus?.status === "pending_sent" ? (
                <p className="text-muted-foreground italic">Connection request sent. Waiting for a response.</p>
              ) : connectionStatus?.status === "pending_received" ? (
                <div className="flex gap-3 justify-center">
                  <Button
                    size="lg"
                    onClick={() => respondMutation.mutate("accepted")}
                    disabled={respondMutation.isPending}
                  >
                    <Check className="w-5 h-5 mr-2" />
                    Accept Request
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => respondMutation.mutate("denied")}
                    disabled={respondMutation.isPending}
                  >
                    Decline
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
