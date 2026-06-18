# Vibeful — deploy to Kubernetes

## Prerequisites

- Kubernetes 1.27+
- Helm 3.12+
- A DeepSeek or OpenAI API key

## Quick Deploy

```bash
# Add secrets
kubectl create secret generic vibeful-secrets \
  --from-literal=deepseek-api-key=sk-... \
  --from-literal=postgres-password=your-password \
  --from-literal=api-keys=sk-your-key:Admin

# Install
helm install vibeful ./deploy/helm/vibeful \
  --set secrets.deepseekApiKey=sk-... \
  --set secrets.postgresPassword=your-password

# Check status
kubectl get pods -l app.kubernetes.io/name=vibeful

# Get the proxy URL
kubectl get svc vibeful-proxy -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

## Configuration

See `values.yaml` for all options. Common overrides:

```bash
helm install vibeful ./deploy/helm/vibeful \
  --set agentEngine.replicas=3 \
  --set agentEngine.env.llmProvider=openai \
  --set proxy.env.authProvider=jwt \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=agent.mycompany.com
```

## Upgrading

```bash
helm upgrade vibeful ./deploy/helm/vibeful --reuse-values
```

## Uninstall

```bash
helm uninstall vibeful
```
