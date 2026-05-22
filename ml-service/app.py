"""
FundTrace AI — ML Service (FastAPI)
Isolation Forest anomaly detection + graph analytics
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import networkx as nx
import joblib
import os
import json
from datetime import datetime

app = FastAPI(title="FundTrace AI ML Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model state
model = None
scaler = None

class TransactionFeatures(BaseModel):
    tx_id: str
    amount: float
    sender_tx_count: int = 0
    receiver_tx_count: int = 0
    sender_total_out: float = 0
    receiver_total_in: float = 0
    time_gap_seconds: float = 0
    hour_of_day: int = 12
    day_of_week: int = 1
    in_out_ratio: float = 1.0
    is_round_amount: int = 0
    channel_encoded: int = 0

class BatchRequest(BaseModel):
    transactions: List[TransactionFeatures]

class GraphRequest(BaseModel):
    nodes: List[dict]
    edges: List[dict]

def extract_features(tx: TransactionFeatures) -> list:
    return [
        tx.amount,
        np.log1p(tx.amount),
        tx.sender_tx_count,
        tx.receiver_tx_count,
        tx.sender_total_out,
        tx.receiver_total_in,
        tx.time_gap_seconds,
        tx.hour_of_day,
        tx.day_of_week,
        tx.in_out_ratio,
        tx.is_round_amount,
        tx.channel_encoded,
        tx.amount / max(tx.sender_total_out, 1),
        tx.sender_tx_count / max(tx.receiver_tx_count, 1),
    ]

def get_or_train_model():
    global model, scaler
    if model is not None:
        return model, scaler
    
    # Generate synthetic training data
    np.random.seed(42)
    n_normal = 2000
    n_fraud = 200

    normal_data = pd.DataFrame({
        'amount': np.random.lognormal(10, 1.5, n_normal),
        'log_amount': np.random.normal(10, 1.5, n_normal),
        'sender_tx_count': np.random.poisson(5, n_normal),
        'receiver_tx_count': np.random.poisson(4, n_normal),
        'sender_total_out': np.random.lognormal(12, 1.5, n_normal),
        'receiver_total_in': np.random.lognormal(12, 1.5, n_normal),
        'time_gap_seconds': np.random.exponential(3600, n_normal),
        'hour_of_day': np.random.choice(range(8, 20), n_normal),
        'day_of_week': np.random.choice(range(7), n_normal),
        'in_out_ratio': np.random.uniform(0.3, 2.0, n_normal),
        'is_round_amount': np.random.choice([0, 1], n_normal, p=[0.7, 0.3]),
        'channel_encoded': np.random.choice(range(5), n_normal),
        'amount_ratio': np.random.uniform(0.1, 0.9, n_normal),
        'tx_count_ratio': np.random.uniform(0.5, 2.0, n_normal),
    })

    fraud_data = pd.DataFrame({
        'amount': np.random.uniform(40000, 49999, n_fraud),  # Structuring
        'log_amount': np.log1p(np.random.uniform(40000, 49999, n_fraud)),
        'sender_tx_count': np.random.poisson(20, n_fraud),
        'receiver_tx_count': np.random.poisson(2, n_fraud),
        'sender_total_out': np.random.lognormal(15, 0.5, n_fraud),
        'receiver_total_in': np.random.lognormal(10, 0.5, n_fraud),
        'time_gap_seconds': np.random.uniform(10, 300, n_fraud),  # Very fast
        'hour_of_day': np.random.choice([0, 1, 2, 3, 23], n_fraud),  # Late night
        'day_of_week': np.random.choice([5, 6], n_fraud),  # Weekends
        'in_out_ratio': np.random.uniform(0.95, 1.0, n_fraud),  # Pass-through
        'is_round_amount': np.ones(n_fraud),
        'channel_encoded': np.zeros(n_fraud),  # API
        'amount_ratio': np.random.uniform(0.85, 0.99, n_fraud),
        'tx_count_ratio': np.random.uniform(5, 20, n_fraud),
    })

    all_data = pd.concat([normal_data, fraud_data], ignore_index=True)
    
    scaler = StandardScaler()
    X = scaler.fit_transform(all_data)
    
    model = IsolationForest(
        n_estimators=200,
        contamination=0.08,
        max_features=0.8,
        random_state=42,
        n_jobs=-1
    )
    model.fit(X)
    
    print("[SUCCESS] Isolation Forest model trained on synthetic fraud data")
    return model, scaler


@app.on_event("startup")
async def startup():
    get_or_train_model()
    print("[READY] FundTrace ML Service ready")


@app.get("/health")
def health():
    return {"status": "operational", "model": "IsolationForest", "service": "FundTrace AI ML"}


@app.post("/predict")
def predict_single(tx: TransactionFeatures):
    clf, sc = get_or_train_model()
    features = extract_features(tx)
    X = sc.transform([features])
    score = clf.score_samples(X)[0]
    prediction = clf.predict(X)[0]
    
    # Normalize to 0-100 risk score (inverted: more negative = higher risk)
    fraud_prob = max(0, min(100, int((-score + 0.5) * 80)))
    is_anomaly = prediction == -1
    
    return {
        "tx_id": tx.tx_id,
        "is_anomaly": is_anomaly,
        "anomaly_score": float(score),
        "fraud_probability": fraud_prob,
        "risk_level": "CRITICAL" if fraud_prob >= 80 else "HIGH" if fraud_prob >= 60 else "MEDIUM" if fraud_prob >= 40 else "LOW"
    }


@app.post("/predict/batch")
def predict_batch(req: BatchRequest):
    clf, sc = get_or_train_model()
    features_list = [extract_features(tx) for tx in req.transactions]
    X = sc.transform(features_list)
    scores = clf.score_samples(X)
    predictions = clf.predict(X)
    
    results = []
    for i, tx in enumerate(req.transactions):
        score = scores[i]
        pred = predictions[i]
        fraud_prob = max(0, min(100, int((-score + 0.5) * 80)))
        results.append({
            "tx_id": tx.tx_id,
            "is_anomaly": pred == -1,
            "anomaly_score": float(score),
            "fraud_probability": fraud_prob,
            "risk_level": "CRITICAL" if fraud_prob >= 80 else "HIGH" if fraud_prob >= 60 else "MEDIUM" if fraud_prob >= 40 else "LOW"
        })
    
    return {"results": results, "total": len(results), "anomalies": sum(1 for r in results if r["is_anomaly"])}


@app.post("/graph/analyze")
def analyze_graph(req: GraphRequest):
    """Analyze fund flow graph using NetworkX"""
    G = nx.DiGraph()
    
    for node in req.nodes:
        G.add_node(node["id"], **node)
    
    for edge in req.edges:
        G.add_edge(edge["source"], edge["target"], **edge)
    
    # Compute graph metrics
    results = {
        "node_count": G.number_of_nodes(),
        "edge_count": G.number_of_edges(),
        "strongly_connected": list(nx.strongly_connected_components(G)),
        "cycles": [],
        "high_betweenness_nodes": [],
        "hub_nodes": [],
    }
    
    # Detect cycles (potential round-trip)
    try:
        cycles = list(nx.simple_cycles(G))
        results["cycles"] = [c for c in cycles if len(c) >= 2][:10]  # Top 10 cycles
        results["round_trip_detected"] = len(results["cycles"]) > 0
    except Exception:
        results["round_trip_detected"] = False
    
    # Betweenness centrality (layering hubs)
    try:
        betweenness = nx.betweenness_centrality(G)
        top_nodes = sorted(betweenness.items(), key=lambda x: -x[1])[:5]
        results["high_betweenness_nodes"] = [{"node": n, "score": round(s, 4)} for n, s in top_nodes]
    except Exception:
        pass
    
    # Out-degree hubs (fan-out sources)
    out_degrees = dict(G.out_degree())
    top_hubs = sorted(out_degrees.items(), key=lambda x: -x[1])[:5]
    results["hub_nodes"] = [{"node": n, "out_degree": d} for n, d in top_hubs if d >= 3]
    
    # In-degree sinks (mule accounts)
    in_degrees = dict(G.in_degree())
    top_sinks = sorted(in_degrees.items(), key=lambda x: -x[1])[:5]
    results["sink_nodes"] = [{"node": n, "in_degree": d} for n, d in top_sinks if d >= 3]
    
    return results


@app.get("/model/info")
def model_info():
    clf, _ = get_or_train_model()
    return {
        "algorithm": "Isolation Forest",
        "n_estimators": clf.n_estimators,
        "contamination": clf.contamination,
        "features": [
            "amount", "log_amount", "sender_tx_count", "receiver_tx_count",
            "sender_total_out", "receiver_total_in", "time_gap_seconds",
            "hour_of_day", "day_of_week", "in_out_ratio", "is_round_amount",
            "channel_encoded", "amount_ratio", "tx_count_ratio"
        ],
        "trained_on": "Synthetic banking fraud dataset (2000 normal + 200 fraudulent)",
        "description": "Unsupervised anomaly detection for AML use case"
    }
