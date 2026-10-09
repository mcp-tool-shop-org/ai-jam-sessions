import json, sys, numpy as np
sys.path.insert(0, 'scripts'); import voice_gate as vg
marks = json.load(open('scores/receipts/voice-gate-eval-2026-10-08/director-marks-2026-10-07.json', encoding='utf-8'))['entries']
cases = [('ag-phrase16w','amazing-grace-new-britain:phrase16w','tmp/voice-gate/ag-old.clock.json'),
         ('am-phrase16w','america-the-beautiful-materna:phrase16w','tmp/voice-gate/am-old.clock.json'),
         ('ag-phrase16w2','amazing-grace-new-britain:phrase16w2','tmp/voice-gate/ag-old.clock.json'),
         ('am-phrase16w2','america-the-beautiful-materna:phrase16w2','tmp/voice-gate/am-old.clock.json'),
         ('ag-pad16','amazing-grace-new-britain:pad16','tmp/voice-gate/ag-old.clock.json'),
         ('am-pad16','america-the-beautiful-materna:pad16','tmp/voice-gate/am-old.clock.json'),
         ('bh-kimi',None,'scores/battle-hymn-of-the-republic.score-clock.v1.json'),
         ('ag-kimi',None,'scores/amazing-grace-new-britain.score-clock.v1.json'),
         ('am-kimi',None,'scores/america-the-beautiful-materna.score-clock.v1.json')]
TOL = 1.5
tot = {'noise': 0, 'hit': 0, 'flags': 0, 'flags_near_any_mark': 0}
for name, key, clock in cases:
    f = np.load(f'tmp/voice-gate/{name}.npz')
    r = vg.judge(f['t'], f['voice'], f['overlap'], json.load(open(clock, encoding='utf-8')))
    flags = [x['t'] for x in r['voice_in_rest'] + r['overlong_release'] + r['two_voices']] + [x['t'] for x in r['silent_notes']]
    ms = (marks[key]['marks'] if key else [])
    noise = [m['t'] for m in ms if 'noise' in m['cats']]
    other = [m['t'] for m in ms if 'noise' not in m['cats']]
    hit = [n for n in noise if any(abs(n - x) <= TOL for x in flags)]
    near = [x for x in flags if any(abs(x - m['t']) <= TOL for m in ms)]
    tot['noise'] += len(noise); tot['hit'] += len(hit); tot['flags'] += len(flags); tot['flags_near_any_mark'] += len(near)
    print(f"{name:14s} noise marks {len(noise)} caught {len(hit)} | flags {len(flags)} (rest {len(r['voice_in_rest'])}, long-release {len(r['overlong_release'])}, two {len(r['two_voices'])}, silent {len(r['silent_notes'])}) near a mark {len(near)} | other marks {len(other)}")
    if noise: print('    noise at', noise, '\n    flags at', [round(x,1) for x in flags])
print(tot)
