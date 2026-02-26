import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, Clock, Users } from "lucide-react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ConnectionRequest {
  id: number;
  requesterId?: string;
  recipientId?: string;
  status: string;
  createdAt: string;
  displayName: string;
  instrument: string | null;
  level: string | null;
  avatarUrl: string | null;
}

interface AcceptedConnection {
  connectionId: number;
  userId: string;
  displayName: string;
  instrument: string | null;
  level: string | null;
  avatarUrl: string | null;
  location: string | null;
}

export default function ConnectionsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: received = [] } = useQuery<ConnectionRequest[]>({
    queryKey: ["/api/connections/received"],
  });

  const { data: sent = [] } = useQuery<ConnectionRequest[]>({
    queryKey: ["/api/connections/sent"],
  });

  const { data: accepted = [] } = useQuery<AcceptedConnection[]>({
    queryKey: ["/api/connections"],
  });

  const respondMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "accepted" | "denied" }) => {
      await apiRequest("PATCH", `/api/connections/${id}`, { status });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/connections/received"] });
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      toast({
        title: variables.status === "accepted" ? "Connection accepted" : "Request declined",
      });
    },
    onError: () => {
      toast({ title: "Failed to update request", variant: "destructive" });
    },
  });

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="font-serif text-3xl font-bold mb-2" data-testid="text-connections-title">Connections</h1>
        <p className="text-muted-foreground mb-8">Manage your musician network</p>

        <Tabs defaultValue="received" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="received" data-testid="tab-received">
              Received {received.length > 0 && `(${received.length})`}
            </TabsTrigger>
            <TabsTrigger value="sent" data-testid="tab-sent">
              Sent {sent.length > 0 && `(${sent.length})`}
            </TabsTrigger>
            <TabsTrigger value="connections" data-testid="tab-connections">
              Connected {accepted.length > 0 && `(${accepted.length})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="received">
            {received.length === 0 ? (
              <div className="text-center py-16 bg-muted/20 rounded-lg" data-testid="text-no-received">
                <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground italic">No pending requests</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {received.map(req => (
                  <Card key={req.id} className="border-none shadow-sm" data-testid={`card-received-${req.id}`}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <Avatar className="w-14 h-14">
                        <AvatarImage src={req.avatarUrl || undefined} />
                        <AvatarFallback>{req.displayName?.split(' ').map(n => n[0]).join('') || '?'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <h3 className="font-serif text-lg font-bold" data-testid={`text-requester-${req.id}`}>{req.displayName}</h3>
                        <p className="text-sm text-muted-foreground">
                          {req.level}{req.instrument ? ` • ${req.instrument}` : ''}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => respondMutation.mutate({ id: req.id, status: "accepted" })}
                          disabled={respondMutation.isPending}
                          data-testid={`button-accept-${req.id}`}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => respondMutation.mutate({ id: req.id, status: "denied" })}
                          disabled={respondMutation.isPending}
                          data-testid={`button-deny-${req.id}`}
                        >
                          <X className="w-4 h-4 mr-1" />
                          Deny
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="sent">
            {sent.length === 0 ? (
              <div className="text-center py-16 bg-muted/20 rounded-lg" data-testid="text-no-sent">
                <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground italic">No sent requests</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {sent.map(req => (
                  <Card key={req.id} className="border-none shadow-sm" data-testid={`card-sent-${req.id}`}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <Avatar className="w-14 h-14">
                        <AvatarImage src={req.avatarUrl || undefined} />
                        <AvatarFallback>{req.displayName?.split(' ').map(n => n[0]).join('') || '?'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <h3 className="font-serif text-lg font-bold" data-testid={`text-recipient-${req.id}`}>{req.displayName}</h3>
                        <p className="text-sm text-muted-foreground">
                          {req.level}{req.instrument ? ` • ${req.instrument}` : ''}
                        </p>
                      </div>
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        Pending
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="connections">
            {accepted.length === 0 ? (
              <div className="text-center py-16 bg-muted/20 rounded-lg" data-testid="text-no-connections">
                <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground italic">No connections yet</p>
                <p className="text-xs text-muted-foreground mt-1">Search for musicians to connect with</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {accepted.map(conn => (
                  <Link key={conn.connectionId} href={`/user/${conn.userId}`}>
                    <Card className="hover:bg-muted/30 transition-colors cursor-pointer border-none shadow-sm" data-testid={`card-connection-${conn.userId}`}>
                      <CardContent className="p-4 flex items-center gap-4">
                        <Avatar className="w-14 h-14">
                          <AvatarImage src={conn.avatarUrl || undefined} />
                          <AvatarFallback>{conn.displayName?.split(' ').map(n => n[0]).join('') || '?'}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <h3 className="font-serif text-lg font-bold" data-testid={`text-connection-${conn.userId}`}>{conn.displayName}</h3>
                          <p className="text-sm text-muted-foreground">
                            {conn.level}{conn.instrument ? ` • ${conn.instrument}` : ''}
                          </p>
                        </div>
                        <Check className="w-5 h-5 text-green-600" />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
