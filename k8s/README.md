# Kubernetes Manifests for Iapteca Microservices

This directory contains Kubernetes manifests for deploying the Iapteca microservices architecture in a Minikube cluster.

## Files

### Configuration
- `configmap.yaml` - Configuration values (environment variables)
- `secret.yaml` - Sensitive data (database credentials)

### Deployments
- `product-catalog-deployment.yaml` - Product Catalog service (2 replicas)
- `order-processing-deployment.yaml` - Order Processing service (3 replicas)
- `mongo-deployment.yaml` - MongoDB database (3 replicas with replica set)

### Services
- `product-catalog-service.yaml` - Service for Product Catalog
- `order-processing-service.yaml` - Service for Order Processing
- `mongo-service.yaml` - Service for MongoDB

### Storage
- `mongo-pvc.yaml` - Persistent Volume Claim for MongoDB data

## Security Features

### Least Privilege Principle
- **Product-Catalog**: Uses read-only MongoDB connection string
- **Order-Processing**: Uses read-write MongoDB connection string
- Database credentials are stored in Kubernetes Secrets

### Resource Management
Each container has resource requests and limits:
- Product-Catalog: 100m-500m CPU, 128Mi-512Mi memory
- Order-Processing: 200m-1000m CPU, 256Mi-1Gi memory
- MongoDB: 200m-500m CPU, 256Mi-512Mi memory

## Health Checks

All services include:
- **Readiness Probes**: Service is ready to receive traffic
- **Liveness Probes**: Service is healthy and should continue running

## Deployment Order

1. Apply ConfigMap and Secret first
2. Deploy MongoDB (database dependency)
3. Deploy Product-Catalog and Order-Processing services

## Usage

To deploy in Minikube:

```bash
# First, start Minikube if not already running
minikube start

# Apply all manifests
kubectl apply -f configmap.yaml -f secret.yaml -f product-catalog-deployment.yaml -f product-catalog-service.yaml -f order-processing-deployment.yaml -f order-processing-service.yaml -f mongo-deployment.yaml -f mongo-service.yaml -f mongo-pvc.yaml

# Verify deployment
kubectl get all -n iapteca
```

## Monitoring

Check pod status and logs:

```bash
# View pod status
kubectl get pods -n iapteca -w

# Check pod logs
kubectl logs -n iapteca -f <pod-name>

# View service endpoints
kubectl get svc -n iapteca
```
