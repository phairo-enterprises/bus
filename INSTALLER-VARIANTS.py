#!/usr/bin/env python3
"""Derive i1/i2 and exact i3 copy from accepted c4; never execute installers.
Usage: python3 INSTALLER-VARIANTS.py /path/to/c4 /new/output/directory
The input must have the exact published c4 SHA256. Existing outputs are rejected.
"""
import hashlib, json, pathlib, sys
BASE_SHA256 = 'be68dbe6fd0f42559f9d667b51c0e45e2d7fdf0c1f1547da6e85c05b6473f5b5'
OFFSET = 0xc14dc
OLD = b'comma4-accord26-all-v2?' + b' ' * 64
PROFILES = {
 'i1': ('comma4-accord26-fingerprint-v1', '543c084cdfe8025c90cd39c18e1fab21e936a7f5'),
 'i2': ('comma4-accord26-ui-v2', '32d013e10aeb0310d250adcd04408a97c8b95786'),
 'i3': ('comma4-accord26-all-v2', 'f66e80a4c58380aaa0252c9dd1c1f8cdaea5bb66'),
}
def require(ok, text):
 if not ok: raise ValueError(text)
def derive(data, branch):
 require(len(data)==2040200 and hashlib.sha256(data).hexdigest()==BASE_SHA256, 'Unexpected base binary')
 require(data.count(OLD)==1 and data[OFFSET:OFFSET+len(OLD)]==OLD, 'Unexpected slot')
 require(data[OFFSET+len(OLD)]==0, 'Missing unchanged NUL')
 raw=branch.encode('ascii')+b'?'
 # Constructor loads bytes 0..79 and writes spaces at positions 79..86.
 require(len(raw)<=79, 'Delimiter must precede constructor space tail')
 slot=raw.ljust(len(OLD), b' ')
 out=data[:OFFSET]+slot+data[OFFSET+len(OLD):]
 require(out[:OFFSET]==data[:OFFSET] and out[OFFSET+len(OLD):]==data[OFFSET+len(OLD):], 'Out-of-slot difference')
 require(out[OFFSET:OFFSET+87].split(b'?',1)[0].decode()==branch, 'Parse failure')
 return out
if __name__=='__main__':
 require(len(sys.argv)==3, __doc__)
 src=pathlib.Path(sys.argv[1]); dst=pathlib.Path(sys.argv[2]); data=src.read_bytes()
 require(not dst.exists(), 'Output directory must be new')
 candidates={name:derive(data,branch) for name,(branch,head) in PROFILES.items()}
 dst.mkdir(parents=True)
 manifest={'base_sha256':BASE_SHA256,'branch_slot_offset':hex(OFFSET),'branch_slot_length':87,'method':'fixed-width branch-data substitution; no ARM execution or compilation','heads_observed_utc':'2026-10-25T16:50Z','branch_heads_are_not_pinned_at_install':True,'variants':{}}
 for name,out in candidates.items():
  path=dst/name; path.write_bytes(out); path.chmod(0o644)
  branch,head=PROFILES[name]
  manifest['variants'][name]={'branch':branch,'observed_head':head,'size':len(out),'sha256':hashlib.sha256(out).hexdigest(),'git_blob_sha1':hashlib.sha1(b'blob '+str(len(out)).encode()+b'\0'+out).hexdigest(),'changed_bytes':sum(x!=y for x,y in zip(out,data))}
 (dst/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print(json.dumps(manifest,indent=2))
