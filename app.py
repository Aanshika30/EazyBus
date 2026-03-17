from flask import Flask, render_template, jsonify, request
import json
import os
import subprocess
import sys

app = Flask(__name__)

CLUSTERS_FILE = "clusters.json"
CSV_FILE = "south_delhi_optimized.csv"


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/clusters')
def get_clusters():
    if not os.path.exists(CLUSTERS_FILE):
        return jsonify({
            "error": "clusters.json not found. Run: python generate_clusters.py"
        }), 500

    try:
        with open(CLUSTERS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)

        if "clusters" not in data or not data["clusters"]:
            return jsonify({"error": "clusters.json has no clusters array"}), 500

        return jsonify(data)

    except Exception as e:
        return jsonify({"error": f"Invalid clusters.json: {str(e)}"}), 500


@app.route('/api/all-stops')
def get_all_stops():
    """Return all individual bus stops from the CSV for the 'Show All Stops' toggle."""
    if not os.path.exists(CSV_FILE):
        return jsonify({"error": f"{CSV_FILE} not found"}), 404

    try:
        import pandas as pd

        df = pd.read_csv(CSV_FILE)

        # Auto-detect columns
        col_map = {}
        for col in df.columns:
            lc = col.lower().strip()
            if lc in ('stop_name', 'name', 'stopname'):
                col_map['stop_name'] = col
            elif lc in ('stop_lat', 'lat', 'latitude'):
                col_map['stop_lat'] = col
            elif lc in ('stop_lon', 'lon', 'lng', 'longitude', 'stop_lng'):
                col_map['stop_lon'] = col

        df = df.rename(columns={v: k for k, v in col_map.items()})
        df = df[['stop_name', 'stop_lat', 'stop_lon']].dropna()
        df['stop_lat'] = pd.to_numeric(df['stop_lat'], errors='coerce')
        df['stop_lon'] = pd.to_numeric(df['stop_lon'], errors='coerce')
        df = df.dropna()

        # Filter to Delhi
        df = df[
            df['stop_lat'].between(28.3, 28.8) &
            df['stop_lon'].between(76.9, 77.5)
        ]

        stops = df.rename(columns={
            'stop_name': 'name',
            'stop_lat': 'lat',
            'stop_lon': 'lon'
        }).to_dict(orient='records')

        return jsonify({"stops": stops, "count": len(stops)})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/recluster')
def recluster():
    """Re-run K-Means with a different K value. Usage: /api/recluster?k=10"""
    k = request.args.get('k', 7, type=int)
    if not 2 <= k <= 20:
        return jsonify({"error": "k must be between 2 and 20"}), 400

    try:
        result = subprocess.run(
            [sys.executable, "generate_clusters.py", "--k", str(k)],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode != 0:
            return jsonify({"error": result.stderr}), 500

        with open(CLUSTERS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    if not os.path.exists(CLUSTERS_FILE):
        print("⚠️  clusters.json not found. Run: python generate_clusters.py")
    app.run(debug=True, port=5001)