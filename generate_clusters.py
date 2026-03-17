import pandas as pd
import json
from sklearn.cluster import KMeans

def generate_clusters(csv_path="south_delhi_optimized.csv", n_clusters=7, output_path="clusters.json"):
    print(f"Reading {csv_path}...")
    df = pd.read_csv(csv_path)

    print(f"Columns found: {df.columns.tolist()}")
    print(f"Total rows in CSV: {len(df)}")

    # ── Auto-detect column names ──────────────────────────────────────────
    col_map = {}
    for col in df.columns:
        lc = col.lower().strip()
        if lc in ('stop_id', 'id', 'stopid'):
            col_map['stop_id'] = col
        elif lc in ('stop_name', 'name', 'stopname', 'stop name'):
            col_map['stop_name'] = col
        elif lc in ('stop_lat', 'lat', 'latitude', 'stop_latitude'):
            col_map['stop_lat'] = col
        elif lc in ('stop_lon', 'lon', 'lng', 'longitude', 'stop_lng', 'stop_longitude'):
            col_map['stop_lon'] = col

    # stop_name, stop_lat, stop_lon are required
    missing = [k for k in ('stop_name', 'stop_lat', 'stop_lon') if k not in col_map]
    if missing:
        raise ValueError(
            f"Cannot find columns for: {missing}\n"
            f"Your CSV has: {df.columns.tolist()}"
        )

    # Rename to standard names
    df = df.rename(columns={v: k for k, v in col_map.items()})

    if 'stop_id' in col_map:
        # Best method: deduplicate by stop_id (most accurate)
        df = df.drop_duplicates(subset='stop_id')
        print(f"Deduplicated by stop_id → {len(df)} unique physical stops")
    else:
        # Fallback: deduplicate by name + coordinates
        df = df.drop_duplicates(subset=['stop_name', 'stop_lat', 'stop_lon'])
        print(f"Deduplicated by stop_name+coords → {len(df)} unique physical stops")

    # Keep only needed columns and clean
    keep = ['stop_name', 'stop_lat', 'stop_lon']
    if 'stop_id' in df.columns:
        keep.insert(0, 'stop_id')
    df = df[keep].copy()

    # Convert coordinates to float
    df['stop_lat'] = pd.to_numeric(df['stop_lat'], errors='coerce')
    df['stop_lon'] = pd.to_numeric(df['stop_lon'], errors='coerce')
    df = df.dropna(subset=['stop_lat', 'stop_lon'])

    # Filter to South Delhi / Delhi area
    df = df[
        df['stop_lat'].between(28.2, 28.9) &
        df['stop_lon'].between(76.8, 77.6)
    ]

    print(f"Valid unique stops in Delhi bounds: {len(df)}")

    if len(df) < n_clusters:
        raise ValueError(
            f"Only {len(df)} unique stops found — need at least {n_clusters} to cluster."
        )

    # ── K-Means Clustering ────────────────────────────────────────────────
    X = df[['stop_lat', 'stop_lon']].values
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    df['cluster'] = kmeans.fit_predict(X)

    # ── Build cluster output ──────────────────────────────────────────────
    clusters = []
    for i in range(n_clusters):
        cluster_df = df[df['cluster'] == i]
        stop_list  = cluster_df['stop_name'].tolist()
        count      = len(stop_list)   # count of UNIQUE physical stops

        lat = float(kmeans.cluster_centers_[i][0])
        lon = float(kmeans.cluster_centers_[i][1])

        print(f"Hub {i+1}: center=[{lat:.5f}, {lon:.5f}]  unique stops={count}")

        clusters.append({
            "hub_id":         i + 1,
            "hub_name":       f"Hub {i+1}",   # renamed below
            "center":         [lat, lon],      # always [lat, lon] as floats
            "stop_count":     count,           # unique physical stops only
            "stops_assigned": stop_list[:30],  # first 30 for popup
        })

    # Sort biggest cluster first, re-assign IDs
    clusters.sort(key=lambda x: x['stop_count'], reverse=True)
    for idx, cl in enumerate(clusters):
        cl['hub_id'] = idx + 1

    # Friendly South Delhi area names
    nice_names = [
        "Saket Area",
        "Nehru Place",
        "Vasant Kunj",
        "Hauz Khas",
        "Greater Kailash",
        "Lajpat Nagar",
        "Kalkaji / Okhla"
    ]
    for i, cl in enumerate(clusters):
        cl['hub_name'] = nice_names[i] if i < len(nice_names) else f"Hub {cl['hub_id']}"

    output = {
        "clusters":    clusters,
        "total_stops": len(df),   # total unique physical stops
        "k":           n_clusters
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nSaved {len(clusters)} hubs to {output_path}")
    print(f"Total unique physical stops processed: {len(df)}")
    return clusters


if __name__ == "__main__":
    generate_clusters()