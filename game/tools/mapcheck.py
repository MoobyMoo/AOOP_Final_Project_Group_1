"""Lint the R1 text map: equal widths, gate/raft reachable, every crate reachable (treasure only through the door)."""
import sys, re, collections
src = open(sys.argv[1]).read()
rows = re.search(r"MAP = \[(.*?)\];", src, re.S).group(1)
M = re.findall(r'"([^"]*)"', rows)
W = len(M[0]); bad = [i for i, r in enumerate(M) if len(r) != W]
print("size", W, "x", len(M), "bad widths", bad)
BLOCK = set("#~T")
def bfs(start, door_open):
    seen = {start}; q = collections.deque([start])
    while q:
        r, c = q.popleft()
        for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
            rr, cc = r+dr, c+dc
            if not (0 <= rr < len(M) and 0 <= cc < W) or (rr, cc) in seen: continue
            ch = M[rr][cc]
            if ch in BLOCK or (ch == "D" and not door_open): continue
            seen.add((rr, cc)); q.append((rr, cc))
    return seen
find = lambda ch: [(r, c) for r, row in enumerate(M) for c, x in enumerate(row) if x == ch]
g = find("G")[0]
closed, opened = bfs(g, False), bfs(g, True)
for ch in "RcgyK12S":
    for p in find(ch):
        print(ch, p, "reachable" if p in closed else ("behind door" if p in opened else "UNREACHABLE"))
print("walkable tiles", len(closed), "with door", len(opened))
