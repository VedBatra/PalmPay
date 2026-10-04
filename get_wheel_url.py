import urllib.request
import json
import os

def download_wheel():
    url = "https://pypi.org/pypi/opencv-python-headless/json"
    print("Fetching PyPI releases info...")
    try:
        req = urllib.request.urlopen(url)
        data = json.loads(req.read().decode())
        
        releases = data.get("releases", {})
        # Let's search for the version 4.13.0.92
        version = "4.13.0.92"
        files = releases.get(version, [])
        if not files:
            # Fallback: get files from the latest version
            latest_version = data.get("info", {}).get("version")
            print(f"Version {version} not found in releases, using latest: {latest_version}")
            files = releases.get(latest_version, [])
            
        found_url = None
        filename = None
        for f in files:
            fname = f.get("filename", "")
            if "cp37-abi3-manylinux_2_28_aarch64.whl" in fname:
                found_url = f.get("url")
                filename = fname
                break
                
        if found_url:
            print(f"Found Wheel: {filename}")
            print(f"Download URL: {found_url}")
            print("Downloading wheel file...")
            urllib.request.urlretrieve(found_url, filename)
            print("Download completed successfully!")
            return filename
        else:
            print("Could not find matching cp37-abi3-manylinux_2_28_aarch64.whl file.")
            # Print some filenames to see what we have
            print("Available filenames for this version:")
            for f in files[:10]:
                print(" -", f.get("filename"))
    except Exception as e:
        print(f"Error downloading wheel: {e}")
    return None

if __name__ == "__main__":
    download_wheel()
