# WebSocket Deployment Patterns for Multiplayer Games

## Table of Contents
1. [Local Development Setup with Docker Compose](#local-development-setup)
2. [AWS Production Deployment with EKS + Agones + NLB/ALB](#aws-production-deployment)
3. [Request Flow Diagrams](#request-flow-diagrams)
4. [WebSocket Connection Lifecycle Management](#websocket-connection-lifecycle)
5. [Load Balancing Strategies](#load-balancing-strategies)
6. [Health Check and Monitoring Patterns](#health-check-monitoring)
7. [Port Configurations and Routing Rules](#port-configurations)

---

## Local Development Setup with Docker Compose

### Architecture Overview
```
┌─────────────────────────────────────────────────────────────┐
│                    Developer Machine                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   Client    │  │  Game Server│  │   Redis     │          │
│  │   (Browser) │◄─┤ WebSocket   │◄─┤  (State)    │          │
│  │   :3000     │  │   Server    │  │   :6379     │          │
│  │             │  │   :8080     │  │             │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│         │                │                │                │
│         └────────────────┼────────────────┘                │
│                          │                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Docker Compose Network                  │   │
│  │           (game-room_default network)               │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Docker Compose Configuration

```yaml
# docker-compose.yml
version: '3.8'

services:
  # WebSocket Game Server
  game-server:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
      - "8081:8081"  # Health check endpoint
    environment:
      - NODE_ENV=development
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - WS_PORT=8080
      - HEALTH_CHECK_PORT=8081
    volumes:
      - .:/app
      - /app/node_modules
    depends_on:
      - redis
    networks:
      - game-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8081/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Redis for Session Management
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - game-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Nginx Reverse Proxy (Optional for SSL termination)
  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - game-server
    networks:
      - game-network
    restart: unless-stopped

volumes:
  redis_data:

networks:
  game-network:
    driver: bridge
```

### Game Server Dockerfile

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Expose ports
EXPOSE 8080 8081

# Health check script
COPY healthcheck.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/healthcheck.sh

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD /usr/local/bin/healthcheck.sh

# Start the server
CMD ["npm", "start"]
```

### Health Check Script

```bash
#!/bin/sh
# healthcheck.sh
curl -f http://localhost:8081/health || exit 1
```

---

## AWS Production Deployment with EKS + Agones + NLB/ALB

### Architecture Overview
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                    Internet                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                              ┌─────────────────┐                              │
│                              │ Route 53 DNS    │                              │
│                              │   (game.com)    │                              │
│                              └─────────────────┘                              │
│                                      │                                        │
│                         ┌────────────┴────────────┐                           │
│                         │                         │                           │
│              ┌─────────────────┐        ┌─────────────────┐                 │
│              │  NLB (TCP/UDP)  │        │  ALB (HTTP/WS)  │                 │
│              │   Port: 7777    │        │  Port: 443/80   │                 │
│              │  (Game Traffic) │        │ (API/Metadata)  │                 │
│              └─────────────────┘        └─────────────────┘                 │
│                    │                           │                             │
│                    │                           │                             │
│         ┌──────────┴──────────┐    ┌──────────┴──────────┐                  │
│         │                     │    │                     │                  │
│  ┌─────────────┐        ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │   EKS       │        │   EKS       │  │   EKS       │  │   EKS       │   │
│  │  Cluster    │        │  Cluster    │  │  Cluster    │  │  Cluster    │   │
│  │ (Game Servers)│      │ (API/Match)  │  │ (Agones     │  │ (Open Match)│   │
│  │             │        │             │  │ Controller) │  │             │   │
│  └─────────────┘        └─────────────┘  └─────────────┘  └─────────────┘   │
│         │                     │            │               │               │
│  ┌─────────────┐        ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │  Game       │        │  API        │  │  Game       │  │  Match      │   │
│  │  Server     │        │  Gateway    │  │  Server     │  │  Maker      │   │
│  │  Pods       │        │  Pods       │  │  Fleet      │  │  Service    │   │
│  │  (Agones)   │        │             │  │  (Agones)   │  │             │   │
│  └─────────────┘        └─────────────┘  └─────────────┘  └─────────────┘   │
│                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                           AWS VPC                                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │ Public Subnet│  │ Public Subnet│  │ Private Subnet│ │ Private Subnet│ │   │
│  │  │   (AZ-1)    │  │   (AZ-2)    │  │   (AZ-1)    │  │   (AZ-2)    │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### EKS Cluster Configuration

```yaml
# eks-cluster.yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: game-room-cluster
  region: us-east-1
  version: "1.29"

iam:
  withOIDC: true

managedNodeGroups:
  - name: game-server-nodes
    instanceType: g5.xlarge
    minSize: 2
    maxSize: 10
    desiredCapacity: 3
    volumeSize: 50
    ssh:
      allow: true
    iam:
      withAddonPolicies:
        autoScaler: true
        cloudWatch: true
        ebs: true
        efs: true
        albIngress: true
    labels:
      role: game-server
      agones.dev/fleet: game-room

  - name: api-nodes
    instanceType: m5.large
    minSize: 1
    maxSize: 5
    desiredCapacity: 2
    volumeSize: 20
    iam:
      withAddonPolicies:
        autoScaler: true
        cloudWatch: true
        albIngress: true
    labels:
      role: api-gateway

addons:
  - name: vpc-cni
  - name: coredns
  - name: kube-proxy
  - name: aws-ebs-csi-driver

cloudWatch:
  clusterLogging:
    enable: ["api", "audit", "authenticator", "controllerManager", "scheduler"]
```

### Agones GameServer Configuration

```yaml
# gameserver.yaml
apiVersion: agones.dev/v1
kind: GameServer
metadata:
  generateName: game-room-
  labels:
    app: game-room
    version: v1
spec:
  ports:
    - name: default
      portPolicy: Dynamic
      containerPort: 8080
      protocol: TCP
    - name: health
      portPolicy: Dynamic
      containerPort: 8081
      protocol: TCP
  health:
    initialDelaySeconds: 30
    periodSeconds: 10
  template:
    spec:
      containers:
        - name: game-server
          image: your-registry/game-room:latest
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
          env:
            - name: NODE_ENV
              value: "production"
            - name: REDIS_HOST
              value: "redis-service"
            - name: WS_PORT
              value: "8080"
            - name: HEALTH_CHECK_PORT
              value: "8081"
          ports:
            - containerPort: 8080
              name: default
              protocol: TCP
            - containerPort: 8081
              name: health
              protocol: TCP
          readinessProbe:
            httpGet:
              path: /health
              port: 8081
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 8081
            initialDelaySeconds: 30
            periodSeconds: 10
```

### Agones Fleet Configuration

```yaml
# fleet.yaml
apiVersion: agones.dev/v1
kind: Fleet
metadata:
  name: game-room-fleet
spec:
  replicas: 3
  scheduling: Packed
  template:
    spec:
      ports:
        - name: default
          portPolicy: Dynamic
          containerPort: 8080
          protocol: TCP
        - name: health
          portPolicy: Dynamic
          containerPort: 8081
          protocol: TCP
      health:
        initialDelaySeconds: 30
        periodSeconds: 10
      template:
        spec:
          containers:
            - name: game-server
              image: your-registry/game-room:latest
              resources:
                requests:
                  memory: "512Mi"
                  cpu: "500m"
                limits:
                  memory: "1Gi"
                  cpu: "1000m"
              env:
                - name: NODE_ENV
                  value: "production"
                - name: REDIS_HOST
                  value: "redis-service"
                - name: WS_PORT
                  value: "8080"
                - name: HEALTH_CHECK_PORT
                  value: "8081"
```

### Network Load Balancer Service

```yaml
# nlb-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: game-room-nlb
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
    service.beta.kubernetes.io/aws-load-balancer-scheme: "internet-facing"
    service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled: "true"
    service.beta.kubernetes.io/aws-load-balancer-target-type: "ip"
    service.beta.kubernetes.io/aws-load-balancer-healthcheck-protocol: "TCP"
    service.beta.kubernetes.io/aws-load-balancer-healthcheck-port: "8081"
    service.beta.kubernetes.io/aws-load-balancer-healthcheck-interval: "10"
    service.beta.kubernetes.io/aws-load-balancer-healthcheck-timeout: "5"
    service.beta.kubernetes.io/aws-load-balancer-healthcheck-healthy-threshold: "2"
    service.beta.kubernetes.io/aws-load-balancer-healthcheck-unhealthy-threshold: "2"
spec:
  type: LoadBalancer
  loadBalancerClass: service.k8s.aws/nlb
  selector:
    agones.dev/fleet: game-room-fleet
    agones.dev/role: GameServer
  ports:
    - name: websocket
      port: 7777
      targetPort: 8080
      protocol: TCP
    - name: health
      port: 7778
      targetPort: 8081
      protocol: TCP
```

### Application Load Balancer Ingress

```yaml
# alb-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: game-room-alb
  annotations:
    kubernetes.io/ingress.class: "alb"
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/healthcheck-path: /health
    alb.ingress.kubernetes.io/healthcheck-interval-seconds: "10"
    alb.ingress.kubernetes.io/healthcheck-timeout-seconds: "5"
    alb.ingress.kubernetes.io/healthcheck-healthy-threshold-count: "2"
    alb.ingress.kubernetes.io/healthcheck-unhealthy-threshold-count: "2"
    alb.ingress.kubernetes.io/load-balancer-attributes: "idle_timeout.timeout_seconds=3600"
spec:
  rules:
    - http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api-service
                port:
                  number: 80
          - path: /match
            pathType: Prefix
            backend:
              service:
                name: matchmaker-service
                port:
                  number: 8080
```

---

## Request Flow Diagrams

### Client Connection Flow
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │     │ Route 53    │     │     NLB     │     │   EKS       │
│   Browser   │────▶│   DNS       │────▶│  (TCP/UDP)  │────▶│  Cluster    │
│             │     │             │     │  Port:7777  │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │                   │
       │1. DNS Query       │                   │                   │
       │                   │                   │                   │
       │                   │2. DNS Response    │                   │
       │                   │   (NLB IP)        │                   │
       │                   │                   │                   │
       │                                   │3. TCP SYN        │
       │                                   │   (WebSocket)    │
       │                                   │                   │
       │                                   │                   │4. Route to│
       │                                   │                   │   Game     │
       │                                   │                   │   Server   │
       │                                   │                   │   Pod      │
       │                                   │                   │           │
       │                                   │5. TCP SYN/ACK    │                   │
       │                                   │                   │                   │
       │6. WebSocket      │                   │                   │
       │   Upgrade         │                   │                   │
       │   Request         │                   │                   │
       │                   │                   │                   │
       │                   │                   │7. WebSocket      │
       │                   │                   │   Connection     │
       │                   │                   │   Established    │
       │                   │                   │                   │
```

### Game Session Flow
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │     │   Game      │     │   Game      │     │   Redis     │
│   Browser   │◄────┤   Server    │◄────┤   Server    │◄────┤  (Session   │
│             │     │   Pod 1     │     │   Pod 2     │     │   Store)    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │                   │
       │1. Join Game       │                   │                   │
       │   Request         │                   │                   │
       │                   │                   │                   │
       │                   │2. Create Session  │                   │
       │                   │   in Redis        │                   │
       │                   │                   │                   │
       │                   │                   │3. Store Session  │
       │                   │                   │   Data           │
       │                   │                   │                   │
       │4. Session Created │                   │                   │
       │   Response        │                   │                   │
       │                   │                   │                   │
       │5. Game State      │6. Broadcast to    │7. Update State   │
       │   Updates         │   Other Players    │   in Redis       │
       │                   │                   │                   │
```

### Matchmaking Flow
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │     │     ALB     │     │   Match     │     │   Agones    │
│   Browser   │────▶│  (HTTP/WS)  │────▶│   Maker     │────▶│  Allocator  │
│             │     │  Port:443   │     │   Service   │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │                   │
       │1. Find Match     │                   │                   │
       │   Request         │                   │                   │
       │                   │                   │                   │
       │                   │2. Route to        │                   │
       │                   │   Matchmaker      │                   │
       │                   │                   │                   │
       │                   │                   │3. Find Available │
       │                   │                   │   Game Server    │
       │                   │                   │                   │
       │                   │                   │4. Request Game   │
       │                   │                   │   Server from     │
       │                   │                   │   Agones          │
       │                   │                   │                   │
       │                   │                   │5. Allocate Game   │
       │                   │                   │   Server          │
       │                   │                   │                   │
       │6. Match Found     │                   │                   │
       │   (Game Server    │                   │                   │
       │   Endpoint)       │                   │                   │
```

---

## WebSocket Connection Lifecycle Management

### Connection States
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        WebSocket Connection Lifecycle                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │  INIT   │───▶│ CONNECTING  │───▶│  CONNECTED  │───▶│ DISCONNECTING│      │
│  └─────────┘    └─────────────┘    └─────────────┘    └─────────────┘      │
│       │                 │                   │                   │          │
│       │                 │                   │                   │          │
│       ▼                 ▼                   ▼                   ▼          │
│  ┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │ CLOSED  │    │  TIMEOUT    │    │   ACTIVE    │    │   CLOSED    │      │
│  └─────────┘    └─────────────┘    └─────────────┘    └─────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Connection Management Implementation

```typescript
// connection-manager.ts
export class ConnectionManager {
  private connections = new Map<string, WebSocketConnection>();
  private heartbeatInterval: NodeJS.Timer;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly CONNECTION_TIMEOUT = 60000; // 60 seconds

  constructor() {
    this.startHeartbeat();
  }

  public addConnection(ws: WebSocket, playerId: string): void {
    const connection = new WebSocketConnection(ws, playerId);
    this.connections.set(playerId, connection);
    
    ws.on('close', () => this.handleConnectionClose(playerId));
    ws.on('error', (error) => this.handleConnectionError(playerId, error));
    ws.on('pong', () => this.handleHeartbeatResponse(playerId));
  }

  public removeConnection(playerId: string): void {
    const connection = this.connections.get(playerId);
    if (connection) {
      connection.close();
      this.connections.delete(playerId);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.connections.forEach((connection, playerId) => {
        if (connection.isStale(this.CONNECTION_TIMEOUT)) {
          console.log(`Connection ${playerId} is stale, terminating`);
          this.removeConnection(playerId);
        } else {
          connection.sendPing();
        }
      });
    }, this.HEARTBEAT_INTERVAL);
  }

  private handleConnectionClose(playerId: string): void {
    console.log(`Connection ${playerId} closed`);
    this.connections.delete(playerId);
    this.notifyPlayerDisconnection(playerId);
  }

  private handleConnectionError(playerId: string, error: Error): void {
    console.error(`Connection ${playerId} error:`, error);
    this.removeConnection(playerId);
  }

  private handleHeartbeatResponse(playerId: string): void {
    const connection = this.connections.get(playerId);
    if (connection) {
      connection.updateLastActivity();
    }
  }

  private notifyPlayerDisconnection(playerId: string): void {
    // Notify other players in the same game session
    const gameSession = this.findPlayerGameSession(playerId);
    if (gameSession) {
      this.broadcastToGameSession(gameSession, {
        type: 'PLAYER_DISCONNECTED',
        playerId: playerId,
        timestamp: Date.now()
      });
    }
  }
}

export class WebSocketConnection {
  private ws: WebSocket;
  private playerId: string;
  private lastActivity: number;
  private isAlive: boolean = true;

  constructor(ws: WebSocket, playerId: string) {
    this.ws = ws;
    this.playerId = playerId;
    this.lastActivity = Date.now();
  }

  public sendPing(): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.ping();
    }
  }

  public updateLastActivity(): void {
    this.lastActivity = Date.now();
    this.isAlive = true;
  }

  public isStale(timeoutMs: number): boolean {
    return !this.isAlive || (Date.now() - this.lastActivity) > timeoutMs;
  }

  public close(): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }
}
```

### Reconnection Strategy

```typescript
// reconnection-manager.ts
export class ReconnectionManager {
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY_BASE = 1000; // 1 second
  private readonly RECONNECT_DELAY_MAX = 30000; // 30 seconds

  public async attemptReconnection(
    playerId: string,
    attempt: number = 1
  ): Promise<boolean> {
    if (attempt > this.MAX_RECONNECT_ATTEMPTS) {
      console.log(`Max reconnection attempts reached for player ${playerId}`);
      return false;
    }

    const delay = Math.min(
      this.RECONNECT_DELAY_BASE * Math.pow(2, attempt - 1),
      this.RECONNECT_DELAY_MAX
    );

    console.log(`Attempting reconnection for player ${playerId}, attempt ${attempt}, delay ${delay}ms`);

    await this.sleep(delay);

    try {
      const success = await this.connectPlayer(playerId);
      if (success) {
        console.log(`Successfully reconnected player ${playerId}`);
        return true;
      }
    } catch (error) {
      console.error(`Reconnection attempt ${attempt} failed for player ${playerId}:`, error);
    }

    return this.attemptReconnection(playerId, attempt + 1);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async connectPlayer(playerId: string): Promise<boolean> {
    // Implementation of player connection logic
    return true;
  }
}
```

---

## Load Balancing Strategies

### 1. Network Load Balancer (NLB) for Game Traffic

**Advantages:**
- Layer 4 load balancing (TCP/UDP)
- Preserves client IP addresses
- Supports long-lived connections
- Low latency (~10ms)
- Static IP addresses

**Configuration:**
```yaml
# Target Group for Game Servers
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  GameServerTargetGroup:
    Type: AWS::ElasticLoadBalancingV2::TargetGroup
    Properties:
      Name: game-server-tg
      Port: 8080
      Protocol: TCP
      VpcId: !Ref VPCId
      TargetType: ip
      HealthCheckProtocol: TCP
      HealthCheckPort: 8081
      HealthCheckIntervalSeconds: 10
      HealthCheckTimeoutSeconds: 5
      HealthyThresholdCount: 2
      UnhealthyThresholdCount: 2
      Matcher:
        HttpCode: "200"

  GameServerNLB:
    Type: AWS::ElasticLoadBalancingV2::LoadBalancer
    Properties:
      Name: game-server-nlb
      Scheme: internet-facing
      Type: network
      Subnets:
        - !Ref PublicSubnet1
        - !Ref PublicSubnet2
      LoadBalancerAttributes:
        - Key: "load_balancing.cross_zone.enabled"
          Value: "true"
```

### 2. Application Load Balancer (ALB) for API Traffic

**Advantages:**
- Layer 7 load balancing (HTTP/HTTPS)
- Path-based routing
- WebSocket support on ports 80/443
- SSL termination
- WAF integration

**Configuration:**
```yaml
# Target Group for API Services
APITargetGroup:
  Type: AWS::ElasticLoadBalancingV2::TargetGroup
  Properties:
    Name: api-tg
    Port: 80
    Protocol: HTTP
    VpcId: !Ref VPCId
    TargetType: ip
    HealthCheckProtocol: HTTP
    HealthCheckPath: /health
    HealthCheckIntervalSeconds: 30
    HealthCheckTimeoutSeconds: 5
    HealthyThresholdCount: 2
    UnhealthyThresholdCount: 2
    Matcher:
      HttpCode: "200"

APIALB:
  Type: AWS::ElasticLoadBalancingV2::LoadBalancer
  Properties:
    Name: api-alb
    Scheme: internet-facing
    Type: application
    Subnets:
      - !Ref PublicSubnet1
      - !Ref PublicSubnet2
    SecurityGroups:
      - !Ref ALBSecurityGroup
```

### 3. Session Affinity Strategies

#### Sticky Sessions (Not Recommended for Games)
```yaml
# Avoid for multiplayer games
sessionAffinity: ClientIP
sessionAffinityConfig:
  clientIP:
    timeoutSeconds: 3600
```

#### Custom Load Balancing with Game State
```typescript
// game-load-balancer.ts
export class GameLoadBalancer {
  private gameServers = new Map<string, GameServer>();
  private playerSessions = new Map<string, string>(); // playerId -> serverId

  public assignPlayerToServer(playerId: string): string {
    // Check if player already has a session
    const existingServerId = this.playerSessions.get(playerId);
    if (existingServerId && this.gameServers.has(existingServerId)) {
      return existingServerId;
    }

    // Find server with lowest load
    let bestServer: GameServer | null = null;
    let lowestLoad = Infinity;

    for (const server of this.gameServers.values()) {
      if (server.canAcceptPlayer() && server.getCurrentLoad() < lowestLoad) {
        bestServer = server;
        lowestLoad = server.getCurrentLoad();
      }
    }

    if (bestServer) {
      this.playerSessions.set(playerId, bestServer.getId());
      bestServer.addPlayer(playerId);
      return bestServer.getId();
    }

    throw new Error('No available game servers');
  }

  public removePlayerFromServer(playerId: string): void {
    const serverId = this.playerSessions.get(playerId);
    if (serverId) {
      const server = this.gameServers.get(serverId);
      if (server) {
        server.removePlayer(playerId);
      }
      this.playerSessions.delete(playerId);
    }
  }
}
```

---

## Health Check and Monitoring Patterns

### 1. Multi-Level Health Checks

#### Application Level Health Check
```typescript
// health-check.ts
export class HealthCheckService {
  private readonly dependencies: Map<string, HealthCheck>;

  constructor() {
    this.dependencies = new Map();
    this.setupDependencies();
  }

  private setupDependencies(): void {
    this.dependencies.set('database', new DatabaseHealthCheck());
    this.dependencies.set('redis', new RedisHealthCheck());
    this.dependencies.set('websocket', new WebSocketHealthCheck());
  }

  public async getHealthStatus(): Promise<HealthStatus> {
    const results = new Map<string, DependencyStatus>();

    for (const [name, checker] of this.dependencies) {
      try {
        const startTime = Date.now();
        await checker.check();
        const responseTime = Date.now() - startTime;

        results.set(name, {
          status: 'healthy',
          responseTime,
          lastCheck: new Date()
        });
      } catch (error) {
        results.set(name, {
          status: 'unhealthy',
          error: error.message,
          lastCheck: new Date()
        });
      }
    }

    const overallStatus = this.calculateOverallStatus(results);
    
    return {
      status: overallStatus,
      timestamp: new Date(),
      dependencies: Object.fromEntries(results),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version
    };
  }

  private calculateOverallStatus(results: Map<string, DependencyStatus>): string {
    const statuses = Array.from(results.values()).map(r => r.status);
    
    if (statuses.every(s => s === 'healthy')) {
      return 'healthy';
    } else if (statuses.some(s => s === 'unhealthy')) {
      return 'unhealthy';
    } else {
      return 'degraded';
    }
  }
}

// health-endpoint.ts
app.get('/health', async (req, res) => {
  try {
    const healthStatus = await healthCheckService.getHealthStatus();
    
    const statusCode = healthStatus.status === 'healthy' ? 200 : 
                      healthStatus.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(healthStatus);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date()
    });
  }
});
```

#### Kubernetes Health Checks
```yaml
# deployment-with-health-checks.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: game-server
spec:
  template:
    spec:
      containers:
        - name: game-server
          image: your-registry/game-room:latest
          readinessProbe:
            httpGet:
              path: /ready
              port: 8081
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 5
            successThreshold: 1
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: /health
              port: 8081
            initialDelaySeconds: 30
            periodSeconds: 30
            timeoutSeconds: 10
            successThreshold: 1
            failureThreshold: 3
          startupProbe:
            httpGet:
              path: /startup
              port: 8081
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
            successThreshold: 1
            failureThreshold: 30
```

### 2. Monitoring with CloudWatch

#### Custom Metrics
```typescript
// cloudwatch-metrics.ts
import { CloudWatch } from 'aws-sdk';

export class CloudWatchMetrics {
  private cloudWatch: CloudWatch;
  private readonly namespace = 'GameRoom';

  constructor() {
    this.cloudWatch = new CloudWatch({ region: process.env.AWS_REGION });
  }

  public async publishActiveConnections(count: number): Promise<void> {
    await this.publishMetric('ActiveConnections', count, 'Count');
  }

  public async publishGameLatency(latencyMs: number): Promise<void> {
    await this.publishMetric('GameLatency', latencyMs, 'Milliseconds');
  }

  public async publishPlayerActions(count: number): Promise<void> {
    await this.publishMetric('PlayerActions', count, 'Count');
  }

  public async publishErrorCount(count: number): Promise<void> {
    await this.publishMetric('Errors', count, 'Count');
  }

  private async publishMetric(
    metricName: string,
    value: number,
    unit: string
  ): Promise<void> {
    const params = {
      Namespace: this.namespace,
      MetricData: [
        {
          MetricName: metricName,
          Value: value,
          Unit: unit,
          Timestamp: new Date(),
          Dimensions: [
            {
              Name: 'Environment',
              Value: process.env.NODE_ENV || 'development'
            }
          ]
        }
      ]
    };

    try {
      await this.cloudWatch.putMetricData(params).promise();
    } catch (error) {
      console.error('Failed to publish CloudWatch metric:', error);
    }
  }
}
```

#### CloudWatch Alarms
```yaml
# cloudwatch-alarms.yaml
Resources:
  HighLatencyAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: game-room-high-latency
      AlarmDescription: 'Game latency is above threshold'
      Namespace: GameRoom
      MetricName: GameLatency
      Statistic: Average
      Period: 60
      EvaluationPeriods: 2
      Threshold: 100
      ComparisonOperator: GreaterThanThreshold
      AlarmActions:
        - !Ref SNSTopicArn

  ConnectionCountAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: game-room-low-connections
      AlarmDescription: 'Active connections are below threshold'
      Namespace: GameRoom
      MetricName: ActiveConnections
      Statistic: Average
      Period: 300
      EvaluationPeriods: 1
      Threshold: 10
      ComparisonOperator: LessThanThreshold
      AlarmActions:
        - !Ref SNSTopicArn
```

---

## Port Configurations and Routing Rules

### 1. Port Allocation Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Port Configuration                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Development Environment:                                                    │
│  ┌─────────────────┬─────────────┬─────────────────┬─────────────────────┐   │
│  │     Service     │   Port      │   Protocol      │       Purpose        │   │
│  ├─────────────────┼─────────────┼─────────────────┼─────────────────────┤   │
│  │   Game Server   │    8080     │      TCP        │   WebSocket Traffic  │   │
│  │   Health Check  │    8081     │      TCP        │   Health Monitoring   │   │
│  │   Redis         │    6379     │      TCP        │   Session Storage    │   │
│  │   Nginx Proxy   │    80/443   │      TCP        │   SSL Termination    │   │
│  └─────────────────┴─────────────┴─────────────────┴─────────────────────┘   │
│                                                                             │
│  Production Environment:                                                    │
│  ┌─────────────────┬─────────────┬─────────────────┬─────────────────────┐   │
│  │     Service     │   Port      │   Protocol      │       Purpose        │   │
│  ├─────────────────┼─────────────┼─────────────────┼─────────────────────┤   │
│  │   NLB External  │    7777     │      TCP        │   Game Traffic       │   │
│  │   NLB Health    │    7778     │      TCP        │   Health Checks      │   │
│  │   ALB External  │    443/80   │      TCP        │   API Traffic        │   │
│  │   Game Server   │    8080     │      TCP        │   WebSocket Traffic  │   │
│  │   Health Check  │    8081     │      TCP        │   Health Monitoring   │   │
│  │   Redis Cluster │  6379-6384  │      TCP        │   Session Storage    │   │
│  └─────────────────┴─────────────┴─────────────────┴─────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2. Security Group Rules

#### Game Server Security Group
```yaml
GameServerSecurityGroup:
  Type: AWS::EC2::SecurityGroup
  Properties:
    GroupDescription: Security group for game servers
    VpcId: !Ref VPCId
    SecurityGroupIngress:
      # WebSocket traffic from NLB
      - IpProtocol: tcp
        FromPort: 8080
        ToPort: 8080
        SourceSecurityGroupId: !Ref NLBSecurityGroup
      # Health checks from NLB
      - IpProtocol: tcp
        FromPort: 8081
        ToPort: 8081
        SourceSecurityGroupId: !Ref NLBSecurityGroup
      # Internal API traffic
      - IpProtocol: tcp
        FromPort: 8080
        ToPort: 8080
        SourceSecurityGroupId: !Ref ALBSecurityGroup
    SecurityGroupEgress:
      # Redis access
      - IpProtocol: tcp
        FromPort: 6379
        ToPort: 6379
        DestinationSecurityGroupId: !Ref RedisSecurityGroup
      # HTTPS outbound
      - IpProtocol: tcp
        FromPort: 443
        ToPort: 443
        CidrIp: 0.0.0.0/0
```

#### NLB Security Group
```yaml
NLBSecurityGroup:
  Type: AWS::EC2::SecurityGroup
  Properties:
    GroupDescription: Security group for NLB
    VpcId: !Ref VPCId
    SecurityGroupIngress:
      # WebSocket traffic from internet
      - IpProtocol: tcp
        FromPort: 7777
        ToPort: 7777
        CidrIp: 0.0.0.0/0
      # Health check traffic from internet
      - IpProtocol: tcp
        FromPort: 7778
        ToPort: 7778
        CidrIp: 0.0.0.0/0
    SecurityGroupEgress:
      # Forward to game servers
      - IpProtocol: tcp
        FromPort: 8080
        ToPort: 8080
        DestinationSecurityGroupId: !Ref GameServerSecurityGroup
```

### 3. Routing Rules Configuration

#### Nginx Configuration (Development)
```nginx
# nginx.conf
events {
    worker_connections 1024;
}

http {
    upstream game_servers {
        server game-server:8080;
    }

    # WebSocket upgrade configuration
    map $http_upgrade $connection_upgrade {
        default upgrade;
        '' close;
    }

    server {
        listen 80;
        server_name localhost;

        # WebSocket endpoint
        location /ws {
            proxy_pass http://game_servers;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # WebSocket timeout settings
            proxy_read_timeout 86400s;
            proxy_send_timeout 86400s;
        }

        # Health check endpoint
        location /health {
            proxy_pass http://game_servers:8081;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }

        # Static files
        location / {
            root /usr/share/nginx/html;
            try_files $uri $uri/ /index.html;
        }
    }
}
```

#### Kubernetes Ingress Rules
```yaml
# ingress-rules.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: game-room-ingress
  annotations:
    kubernetes.io/ingress.class: "alb"
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/ssl-policy: ELBSecurityPolicy-TLS-1-2-2017-01
    alb.ingress.kubernetes.io/backend-protocol: HTTP
    alb.ingress.kubernetes.io/healthcheck-path: /health
    alb.ingress.kubernetes.io/healthcheck-interval-seconds: "30"
    alb.ingress.kubernetes.io/healthcheck-timeout-seconds: "5"
    alb.ingress.kubernetes.io/healthcheck-healthy-threshold-count: "2"
    alb.ingress.kubernetes.io/healthcheck-unhealthy-threshold-count: "2"
spec:
  tls:
    - hosts:
        - game.yourdomain.com
      secretName: game-room-tls
  rules:
    - host: game.yourdomain.com
      http:
        paths:
          # WebSocket connections
          - path: /ws
            pathType: Prefix
            backend:
              service:
                name: game-room-service
                port:
                  number: 8080
          # API endpoints
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api-service
                port:
                  number: 80
          # Matchmaking
          - path: /match
            pathType: Prefix
            backend:
              service:
                name: matchmaker-service
                port:
                  number: 8080
          # Health checks
          - path: /health
            pathType: Exact
            backend:
              service:
                name: game-room-service
                port:
                  number: 8081
```

### 4. DNS Configuration

#### Route 53 Records
```yaml
# route53-records.yaml
GameRoomNLBRecord:
  Type: AWS::Route53::RecordSet
  Properties:
    HostedZoneId: !Ref HostedZoneId
    Name: game.yourdomain.com
    Type: A
    AliasTarget:
      DNSName: !GetAtt GameServerNLB.DNSName
      HostedZoneId: !GetAtt GameServerNLB.CanonicalHostedZoneNameID
    EvaluateTargetHealth: true

GameRoomAPIRecord:
  Type: AWS::Route53::RecordSet
  Properties:
    HostedZoneId: !Ref HostedZoneId
    Name: api.yourdomain.com
    Type: A
    AliasTarget:
      DNSName: !GetAtt APIALB.DNSName
      HostedZoneId: !GetAtt APIALB.CanonicalHostedZoneNameID
    EvaluateTargetHealth: true
```

---

## Summary

This comprehensive guide covers WebSocket deployment patterns for multiplayer games across different environments:

### Key Takeaways:

1. **Local Development**: Use Docker Compose with dedicated networks for isolation and easy development setup.

2. **Production Deployment**: Leverage AWS EKS with Agones for game server management, NLB for WebSocket traffic, and ALB for HTTP/API traffic.

3. **Connection Management**: Implement robust heartbeat mechanisms, connection lifecycle management, and exponential backoff reconnection strategies.

4. **Load Balancing**: Use NLB for game traffic (Layer 4) and ALB for API traffic (Layer 7), with custom load balancing algorithms for optimal player distribution.

5. **Health Checks**: Implement multi-level health checks including application, container, and infrastructure levels with comprehensive monitoring.

6. **Port Configuration**: Follow consistent port allocation strategies with proper security group rules and routing configurations.

This architecture provides a scalable, resilient foundation for multiplayer WebSocket games that can handle thousands of concurrent connections while maintaining low latency and high availability.