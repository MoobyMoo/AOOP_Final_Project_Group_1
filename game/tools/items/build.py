"""Build every item/wearable model, bake AO, export GLBs and save the editable library .blend.

  blender -b --factory-startup --python-exit-code 1 --python tools/items/build.py -- [--only id,id] [--no-export]

Outputs: public/models/items/<id>.glb, spikes/items/items.blend, spikes/items/stats.json
"""
import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
import kit  # noqa: E402
import models_loot  # noqa: E402
import models_wear  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
only = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None
do_export = "--no-export" not in argv

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
glb_dir = os.path.join(ROOT, "public", "models", "items")
out_dir = os.path.join(ROOT, "spikes", "items")
os.makedirs(glb_dir, exist_ok=True)
os.makedirs(out_dir, exist_ok=True)

stats = {}
for kind, fns in (("item", models_loot.ALL), ("wearable", models_wear.ALL)):
    for fn in fns:
        if only and fn.__name__ not in only:
            continue
        model = fn()
        model.kind = kind
        coll = bpy.data.collections.new(model.id)
        scene.collection.children.link(coll)
        ob, tris = model.build(coll)
        d = ob.dimensions
        entry = {"name": model.name, "kind": kind, "tris": tris, "materials": len(ob.data.materials),
                 "dims_m": [round(d.x, 3), round(d.y, 3), round(d.z, 3)]}
        if do_export:
            for o in scene.objects:
                o.select_set(False)
            ob.select_set(True)
            bpy.context.view_layer.objects.active = ob
            path = os.path.join(glb_dir, model.id + ".glb")
            res = bpy.ops.export_scene.gltf(
                filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                export_texcoords=False, export_normals=True, export_materials="EXPORT",
                export_vertex_color="MATERIAL", export_all_vertex_colors=False, export_animations=False,
                export_extras=False, export_cameras=False, export_lights=False)
            if res != {"FINISHED"}:
                raise RuntimeError(f"export failed for {model.id}: {res}")
            entry["glb_bytes"] = os.path.getsize(path)
        stats[model.id] = entry
        print(f"@@ {model.id:14s} {tris:5d} tris  {entry['dims_m']}")

if not only:
    with open(os.path.join(out_dir, "stats.json"), "w") as f:
        json.dump(stats, f, indent=1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "items_preview.blend" if only else "items.blend"))
print("@@ built", len(stats), "models; max tris", max(s["tris"] for s in stats.values()))
