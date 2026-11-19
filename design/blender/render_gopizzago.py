"""Cinematic GoPizzaGo transitions, rendered headless in Blender.

    blender --background --python design/blender/render_gopizzago.py

Env:
    GOPIZZA_SCENE=parachute|oven|both
    GOPIZZA_STILL=36          render only that frame to /tmp/gopizzago-still-<scene>.png
    GOPIZZA_SAMPLES=32

Writes design/blender/*.blend, frames under /tmp/gopizzago-frames,
and public/gopizzago/{parachute,oven}.{mp4,webm,jpg}.
"""

import math
import os
import subprocess

import bmesh
import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PUBLIC = os.path.join(ROOT, "public", "gopizzago")
FRAMES = "/tmp/gopizzago-frames"
os.makedirs(PUBLIC, exist_ok=True)
os.makedirs(FRAMES, exist_ok=True)

W, H = 720, 1280
FPS = 24
SECONDS = 3.0
FRAMES_N = int(FPS * SECONDS)
SAMPLES = int(os.environ.get("GOPIZZA_SAMPLES", "32"))
STILL = os.environ.get("GOPIZZA_STILL", "")


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def link(obj):
    bpy.context.collection.objects.link(obj)
    return obj


def smooth(obj):
    for poly in obj.data.polygons:
        poly.use_smooth = True
    if hasattr(obj.data, "use_auto_smooth"):
        obj.data.use_auto_smooth = False
    return obj


def new_shader(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = False
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (600, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (280, 0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat, nt, bsdf, out


def solid_mat(name, color, rough=0.45, metallic=0.0, coat=0.0, sheen=0.0, emit=0.0, emit_color=None):
    mat, _nt, bsdf, _out = new_shader(name)
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Coat Weight"].default_value = coat
    bsdf.inputs["Sheen Weight"].default_value = sheen
    if emit > 0:
        bsdf.inputs["Emission Color"].default_value = (*(emit_color or color), 1)
        bsdf.inputs["Emission Strength"].default_value = emit
    return mat


def cloth_mat(name, color):
    mat, nt, bsdf, _out = new_shader(name)
    bsdf.inputs["Roughness"].default_value = 0.62
    bsdf.inputs["Sheen Weight"].default_value = 0.35
    bsdf.inputs["Sheen Tint"].default_value = (*color, 1)
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 18
    noise.inputs["Detail"].default_value = 8
    noise.location = (-500, -80)
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.location = (-280, 80)
    ramp.color_ramp.elements[0].color = (*[c * 0.72 for c in color], 1)
    ramp.color_ramp.elements[1].color = (*[min(1, c * 1.15) for c in color], 1)
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.18
    bump.location = (40, -160)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def crust_mat():
    mat, nt, bsdf, _out = new_shader("Crust")
    bsdf.inputs["Roughness"].default_value = 0.72
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 28
    noise.inputs["Detail"].default_value = 10
    noise.location = (-520, 40)
    voro = nt.nodes.new("ShaderNodeTexVoronoi")
    voro.inputs["Scale"].default_value = 40
    voro.location = (-520, -180)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.location = (-220, 40)
    mix.inputs[6].default_value = (0.62, 0.32, 0.12, 1)
    mix.inputs[7].default_value = (0.22, 0.08, 0.03, 1)
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    nt.links.new(voro.outputs["Distance"], mix.inputs["Factor"])
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def sauce_mat():
    mat, nt, bsdf, _out = new_shader("Sauce")
    bsdf.inputs["Roughness"].default_value = 0.28
    bsdf.inputs["Coat Weight"].default_value = 0.25
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 12
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.45, 0.05, 0.03, 1)
    ramp.color_ramp.elements[1].color = (0.78, 0.12, 0.06, 1)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def cheese_mat():
    mat, _nt, bsdf, _out = new_shader("Cheese")
    bsdf.inputs["Base Color"].default_value = (0.98, 0.9, 0.68, 1)
    bsdf.inputs["Roughness"].default_value = 0.32
    bsdf.inputs["Subsurface Weight"].default_value = 0.22
    bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.8, 0.5)
    bsdf.inputs["Subsurface Scale"].default_value = 0.03
    bsdf.inputs["Coat Weight"].default_value = 0.4
    bsdf.inputs["Coat Roughness"].default_value = 0.15
    return mat


def brick_mat(scale=9.0, soot=0.35):
    mat, nt, bsdf, _out = new_shader("Brick")
    bsdf.inputs["Roughness"].default_value = 0.82
    tex = nt.nodes.new("ShaderNodeTexBrick")
    tex.inputs["Scale"].default_value = scale
    tex.inputs["Mortar Size"].default_value = 0.012
    tex.inputs["Mortar Smooth"].default_value = 0.05
    tex.inputs["Brick Width"].default_value = 0.45
    tex.inputs["Row Height"].default_value = 0.22
    tex.inputs["Color1"].default_value = (0.55, 0.16, 0.07, 1)
    tex.inputs["Color2"].default_value = (0.32, 0.09, 0.04, 1)
    tex.inputs["Mortar"].default_value = (0.22, 0.18, 0.15, 1)
    tex.location = (-640, 80)
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 4.5
    noise.location = (-640, -220)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.location = (-280, 40)
    mix.inputs[0].default_value = soot
    mix.inputs[7].default_value = (0.05, 0.03, 0.025, 1)
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.55
    bump.inputs["Distance"].default_value = 0.02
    nt.links.new(tex.outputs["Color"], mix.inputs[6])
    nt.links.new(noise.outputs["Fac"], mix.inputs["Factor"])
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def wood_mat():
    mat, nt, bsdf, _out = new_shader("Wood")
    bsdf.inputs["Roughness"].default_value = 0.48
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "Y"
    wave.inputs["Scale"].default_value = 6
    wave.inputs["Distortion"].default_value = 3
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.28, 0.12, 0.04, 1)
    ramp.color_ramp.elements[1].color = (0.72, 0.42, 0.16, 1)
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def flame_mat():
    mat, nt, bsdf, out = new_shader("Flame")
    mat.blend_method = "BLEND"
    mat.shadow_method = "NONE"
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.05
    ramp.color_ramp.elements[0].color = (1.0, 0.95, 0.7, 1)
    ramp.color_ramp.elements[1].position = 0.85
    ramp.color_ramp.elements[1].color = (0.85, 0.12, 0.02, 1)
    mid = ramp.color_ramp.elements.new(0.4)
    mid.color = (1.0, 0.45, 0.05, 1)
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 8
    alpha = nt.nodes.new("ShaderNodeMath")
    alpha.operation = "MULTIPLY"
    nt.links.new(coord.outputs["Generated"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Emission Color"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Emission Strength"].default_value = 22
    bsdf.inputs["Roughness"].default_value = 1
    nt.links.new(sep.outputs["Z"], alpha.inputs[0])
    nt.links.new(noise.outputs["Fac"], alpha.inputs[1])
    inv = nt.nodes.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.55
    nt.links.new(sep.outputs["Z"], inv.inputs[1])
    nt.links.new(inv.outputs["Value"], bsdf.inputs["Alpha"])
    return mat


def sky_world(top, horizon, strength=1.0):
    world = bpy.data.worlds.new("Sky")
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    geom = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    neg = nt.nodes.new("ShaderNodeMath")
    neg.operation = "MULTIPLY"
    neg.inputs[1].default_value = -1.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.02
    ramp.color_ramp.elements[0].color = (*horizon, 1)
    ramp.color_ramp.elements[1].position = 0.45
    ramp.color_ramp.elements[1].color = (*top, 1)
    nt.links.new(geom.outputs["Incoming"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], neg.inputs[0])
    nt.links.new(neg.outputs["Value"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = strength
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def track_to(obj, target):
    con = obj.constraints.new("TRACK_TO")
    con.target = target
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"


def mesh_from_bmesh(name, bm, material=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    link(obj)
    if material:
        obj.data.materials.append(material)
    return smooth(obj)


def adopt(obj, parent, local=None):
    obj.parent = parent
    if local is None:
        bpy.context.view_layer.update()
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    else:
        # Local coordinates are parent-space. An inverted parent matrix would
        # cancel the parent's transform and leave the child at the origin.
        obj.matrix_parent_inverse.identity()
        obj.location = Vector(local)
    return obj


def empty(name, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    link(obj)
    obj.location = Vector(location)
    return obj


def add_sphere(name, radius, location, material, seg=24, ring=16, scale=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=ring, radius=radius, location=location)
    obj = bpy.context.active_object
    obj.name = name
    if scale:
        obj.scale = scale
    obj.data.materials.append(material)
    return smooth(obj)


def add_cube(name, scale, location, material, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(material)
    return obj


def add_cyl(name, radius, depth, location, material, rotation=(0, 0, 0), verts=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(material)
    return smooth(obj)


def capsule(name, p0, p1, radius, material):
    p0 = Vector(p0)
    p1 = Vector(p1)
    mid = (p0 + p1) / 2
    length = max((p1 - p0).length, 0.001)
    obj = add_cyl(name, radius, length, mid, material, verts=16)
    obj.rotation_euler = (p1 - p0).to_track_quat("Z", "Y").to_euler()
    add_sphere(name + "A", radius, p0, material, 16, 10)
    add_sphere(name + "B", radius, p1, material, 16, 10)
    return obj


def canopy_object(gores=16, rings=28, radius=1.62, height=1.05):
    red = cloth_mat("ChuteRed", (0.82, 0.08, 0.1))
    gold = cloth_mat("ChuteGold", (0.96, 0.72, 0.12))
    bm = bmesh.new()
    center = bm.verts.new((0.0, 0.0, height))
    grid = []
    for i in range(1, rings + 1):
        u = i / rings
        row = []
        for j in range(gores):
            v = j / gores
            ang = v * math.tau
            rib = 0.5 + 0.5 * math.cos(ang * gores)
            r = radius * (u ** 0.9)
            sag = (1.0 - rib) * 0.28 * (u ** 1.35)
            z = height * (math.cos(u * math.pi * 0.5) ** 1.15) - sag
            row.append(bm.verts.new((math.cos(ang) * r, math.sin(ang) * r, z)))
        grid.append(row)
    first = grid[0]
    for j in range(gores):
        j2 = (j + 1) % gores
        face = bm.faces.new((center, first[j], first[j2]))
        face.material_index = j % 2
    for i in range(len(grid) - 1):
        for j in range(gores):
            j2 = (j + 1) % gores
            face = bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j2], grid[i][j2]))
            face.material_index = j % 2
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    obj = mesh_from_bmesh("Canopy", bm)
    obj.data.materials.append(red)
    obj.data.materials.append(gold)
    solid = obj.modifiers.new("Shell", "SOLIDIFY")
    solid.thickness = 0.015
    solid.offset = 1
    sub = obj.modifiers.new("Sub", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 1
    return obj


def cable(p0, p1, sag=0.12):
    curve = bpy.data.curves.new("line", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 0.007
    curve.bevel_resolution = 2
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(2)
    mid = (Vector(p0) + Vector(p1)) / 2
    mid.z -= sag
    for bp, p in zip(spline.bezier_points, (p0, mid, p1)):
        bp.co = Vector(p)
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
    obj = bpy.data.objects.new("Line", curve)
    link(obj)
    obj.data.materials.append(solid_mat("Cord", (0.95, 0.93, 0.86), 0.4))
    return obj


def make_pizza(radius=0.5, bubbles=False):
    root = empty("Pizza")
    crust = crust_mat()
    sauce = sauce_mat()
    cheese = cheese_mat()
    basil = solid_mat("Basil", (0.1, 0.45, 0.12), 0.4, sheen=0.4)
    olive = solid_mat("Olive", (0.08, 0.1, 0.05), 0.35, coat=0.3)
    salami = solid_mat("Salami", (0.7, 0.12, 0.1), 0.4, coat=0.15)
    fat = solid_mat("Fat", (0.95, 0.82, 0.7), 0.3)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=radius * 0.92,
        minor_radius=radius * 0.13,
        major_segments=56,
        minor_segments=14,
        location=(0, 0, 0),
    )
    ring = bpy.context.active_object
    ring.name = "CrustRing"
    ring.data.materials.append(crust)
    adopt(smooth(ring), root, (0, 0, 0))
    disc = add_cyl("SauceDisc", radius * 0.78, 0.035, (0, 0, 0.02), sauce, verts=48)
    adopt(disc, root, (0, 0, 0.02))
    spots = [
        (0.0, 0.0, 1.0),
        (0.42, 0.08, 0.85),
        (-0.38, 0.16, 0.8),
        (0.12, -0.4, 0.78),
        (-0.16, 0.38, 0.75),
        (0.34, -0.28, 0.7),
        (-0.36, -0.22, 0.72),
        (0.05, 0.22, 0.66),
    ]
    for i, (x, y, s) in enumerate(spots):
        blob = add_sphere(f"Mozza{i}", radius * 0.16 * s, (0, 0, 0), cheese, 18, 12, scale=(1.15, 0.95, 0.38))
        adopt(blob, root, (x * radius, y * radius, 0.055))
        if bubbles and i < 4:
            blob.scale = (1.15, 0.95, 0.38)
            blob.keyframe_insert("scale", frame=1)
            blob.scale = (1.25, 1.05, 0.7)
            blob.keyframe_insert("scale", frame=FRAMES_N // 2)
            blob.scale = (1.1, 0.9, 0.42)
            blob.keyframe_insert("scale", frame=FRAMES_N)
    for i, (x, y, rot) in enumerate(((0.2, 0.25, 0.4), (-0.28, 0.05, 1.2), (0.05, -0.3, 2.1), (-0.1, -0.12, 0.8), (0.32, -0.05, 2.6))):
        leaf = add_sphere(f"Leaf{i}", radius * 0.07, (0, 0, 0), basil, 10, 8, scale=(1.8, 0.7, 0.18))
        leaf.rotation_euler = (0.4, 0, rot)
        adopt(leaf, root, (x * radius, y * radius, 0.07))
    for i, (x, y) in enumerate(((0.22, -0.18), (-0.24, 0.22), (0.1, 0.32))):
        bpy.ops.mesh.primitive_torus_add(major_radius=radius * 0.06, minor_radius=radius * 0.022, major_segments=16, minor_segments=8)
        ol = bpy.context.active_object
        ol.data.materials.append(olive)
        adopt(smooth(ol), root, (x * radius, y * radius, 0.06))
    for i, (x, y) in enumerate(((-0.18, -0.28), (0.3, 0.22), (-0.05, 0.12))):
        coin = add_cyl(f"Salami{i}", radius * 0.1, 0.012, (0, 0, 0), salami, verts=20)
        adopt(coin, root, (x * radius, y * radius, 0.06))
        dot = add_sphere(f"Fat{i}", radius * 0.02, (0, 0, 0), fat, 8, 6)
        adopt(dot, root, (x * radius + 0.02, y * radius, 0.07))
    return root


def build_skydiver(rig):
    suit = solid_mat("Suit", (0.72, 0.08, 0.12), 0.45, coat=0.15, sheen=0.45)
    suit_dark = solid_mat("SuitDark", (0.35, 0.05, 0.08), 0.5)
    skin = solid_mat("Skin", (0.9, 0.67, 0.5), 0.4, coat=0.05)
    helmet_m = solid_mat("Helmet", (0.95, 0.9, 0.8), 0.22, coat=0.55)
    stripe = solid_mat("HelmetStripe", (0.85, 0.1, 0.1), 0.3, coat=0.3)
    glass = solid_mat("Goggle", (0.15, 0.08, 0.05), 0.08, metallic=0.85)
    frame = solid_mat("Frame", (0.08, 0.07, 0.07), 0.35)
    boot = solid_mat("Boot", (0.12, 0.08, 0.06), 0.45)
    glove = solid_mat("Glove", (0.93, 0.86, 0.7), 0.4)
    parts = []
    head = add_sphere("Head", 0.2, (0, 0, 0), skin, 24, 16)
    adopt(head, rig, (0, 0.02, 0.78))
    helm = add_sphere("Helmet", 0.23, (0, 0, 0), helmet_m, 28, 16, scale=(1, 1.05, 0.92))
    adopt(helm, rig, (0, 0.04, 0.84))
    band = add_cyl("HelmBand", 0.235, 0.06, (0, 0, 0), stripe, rotation=(math.pi / 2, 0, 0), verts=28)
    adopt(band, rig, (0, 0.02, 0.8))
    gog = add_sphere("Lens", 0.075, (0, 0, 0), glass, 16, 12, scale=(1.3, 0.45, 0.85))
    adopt(gog, rig, (0.07, -0.16, 0.78))
    gog2 = add_sphere("Lens2", 0.075, (0, 0, 0), glass, 16, 12, scale=(1.3, 0.45, 0.85))
    adopt(gog2, rig, (-0.07, -0.16, 0.78))
    bar = add_cyl("GoggleBar", 0.02, 0.16, (0, 0, 0), frame, rotation=(0, math.pi / 2, 0), verts=10)
    adopt(bar, rig, (0, -0.16, 0.78))
    torso = add_sphere("Torso", 0.28, (0, 0, 0), suit, 24, 16, scale=(0.85, 0.62, 1.15))
    adopt(torso, rig, (0, 0.02, 0.38))
    belt = add_cyl("Belt", 0.2, 0.06, (0, 0, 0), suit_dark, verts=20)
    belt.scale = (1.15, 0.75, 1)
    adopt(belt, rig, (0, 0.02, 0.16))
    for x in (-0.1, 0.1):
        strap = add_cube(f"Strap{x}", (0.035, 0.02, 0.28), (0, 0, 0), suit_dark)
        adopt(strap, rig, (x, -0.12, 0.42))
    # Sitting harness pose: thighs forward, calves down, arms reaching to the pizza.
    joints = {
        "hipL": (-0.12, 0.02, 0.12),
        "hipR": (0.12, 0.02, 0.12),
        "kneeL": (-0.16, -0.34, 0.08),
        "kneeR": (0.16, -0.34, 0.08),
        "footL": (-0.16, -0.38, -0.28),
        "footR": (0.16, -0.38, -0.28),
        "shL": (-0.28, 0.02, 0.52),
        "shR": (0.28, 0.02, 0.52),
        "elL": (-0.22, -0.28, 0.32),
        "elR": (0.22, -0.28, 0.32),
        "hdL": (-0.16, -0.48, 0.22),
        "hdR": (0.16, -0.48, 0.22),
    }
    capsule("ThighL", joints["hipL"], joints["kneeL"], 0.07, suit)
    capsule("ThighR", joints["hipR"], joints["kneeR"], 0.07, suit)
    capsule("CalfL", joints["kneeL"], joints["footL"], 0.055, suit)
    capsule("CalfR", joints["kneeR"], joints["footR"], 0.055, suit)
    capsule("ArmL", joints["shL"], joints["elL"], 0.055, suit)
    capsule("ArmR", joints["shR"], joints["elR"], 0.055, suit)
    capsule("ForeL", joints["elL"], joints["hdL"], 0.045, suit)
    capsule("ForeR", joints["elR"], joints["hdR"], 0.045, suit)
    for key in ("ThighL", "ThighR", "CalfL", "CalfR", "ArmL", "ArmR", "ForeL", "ForeR"):
        obj = bpy.data.objects[key]
        adopt(obj, rig)
        for suffix in ("A", "B"):
            cap = bpy.data.objects.get(key + suffix)
            if cap:
                adopt(cap, rig)
    boot_l = add_sphere("BootL", 0.07, (0, 0, 0), boot, 16, 10, scale=(1.1, 1.6, 0.7))
    adopt(boot_l, rig, joints["footL"])
    boot_r = add_sphere("BootR", 0.07, (0, 0, 0), boot, 16, 10, scale=(1.1, 1.6, 0.7))
    adopt(boot_r, rig, joints["footR"])
    for key, loc in (("GloveL", joints["hdL"]), ("GloveR", joints["hdR"])):
        g = add_sphere(key, 0.05, (0, 0, 0), glove, 12, 8)
        adopt(g, rig, loc)
    return joints


def build_hills():
    grass = solid_mat("Grass", (0.16, 0.38, 0.14), 0.85)
    earth = solid_mat("Earth", (0.28, 0.16, 0.08), 0.9)
    stone = solid_mat("City", (0.07, 0.045, 0.035), 0.8)
    roof = solid_mat("Roof", (0.28, 0.08, 0.05), 0.6)
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=48, y_subdivisions=48, size=40, location=(0, 14, -4.2))
    land = bpy.context.active_object
    land.name = "Valley"
    tex = bpy.data.textures.new("land", "CLOUDS")
    tex.noise_scale = 0.7
    disp = land.modifiers.new("Hills", "DISPLACE")
    disp.texture = tex
    disp.strength = 1.1
    land.data.materials.append(grass)
    smooth(land)
    hill = add_sphere("Hill", 1, (-2, 22, -4.6), earth, 32, 16, scale=(14, 6, 2.4))
    # Città Alta sits off to the side, on the horizon, not behind the diver's face.
    city = empty("CittaAlta", (-5.2, 9.5, -1.8))
    city.scale = (2.4, 2.4, 2.4)
    blocks = [
        ((0.0, 0, 0.9), (1.6, 0.7, 1.8), stone),
        ((-1.5, 0.1, 0.45), (1.3, 0.55, 0.9), stone),
        ((1.6, 0.05, 0.55), (1.5, 0.6, 1.1), stone),
        ((0.05, 0, 2.35), (0.55, 0.55, 1.7), stone),
        ((0.05, 0, 3.35), (0.28, 0.28, 0.55), stone),
        ((2.3, -0.1, 0.7), (0.7, 0.5, 1.4), roof),
        ((-2.2, 0.0, 0.35), (0.9, 0.45, 0.7), roof),
    ]
    for i, (loc, scale, mat) in enumerate(blocks):
        block = add_cube(f"Palazzo{i}", scale, (0, 0, 0), mat)
        adopt(block, city, loc)
    dome = add_sphere("Duomo", 0.45, (0, 0, 0), stone, 24, 12, scale=(1, 1, 0.75))
    adopt(dome, city, (1.15, 0, 1.15))
    for i, x in enumerate((-0.7, -0.35, 0.35, 0.7)):
        merlon = add_cube(f"Merlon{i}", (0.12, 0.16, 0.18), (0, 0, 0), stone)
        adopt(merlon, city, (x, -0.28, 1.85))
    return hill


def cloud(name, loc, scale):
    mat = solid_mat(name + "M", (0.97, 0.98, 1.0), 0.9)
    obj = add_sphere(name, 0.6, loc, mat, 18, 12, scale=scale)
    return obj


def build_parachute():
    clear_scene()
    sky_world((0.18, 0.48, 0.92), (1.0, 0.62, 0.32), 1.15)
    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 3.2
    sun.angle = 0.08
    sun.color = (1, 0.95, 0.85)
    sun_o = bpy.data.objects.new("Sun", sun)
    link(sun_o)
    sun_o.rotation_euler = (0.55, 0.2, 0.9)
    rim = bpy.data.lights.new("Rim", "SUN")
    rim.energy = 2.2
    rim.color = (1, 0.75, 0.45)
    rim_o = bpy.data.objects.new("Rim", rim)
    link(rim_o)
    rim_o.rotation_euler = (1.3, 0, -0.4)
    fill = bpy.data.lights.new("Fill", "AREA")
    fill.energy = 180
    fill.size = 4
    fill.color = (0.75, 0.85, 1)
    fill_o = bpy.data.objects.new("Fill", fill)
    link(fill_o)
    fill_o.location = (-2.5, -3, 2)
    look_at(fill_o, (0, 0, 1))

    rig = empty("Skydiver")
    chute = canopy_object()
    adopt(chute, rig, (0, 0, 1.85))
    cap = add_sphere("Vent", 0.16, (0, 0, 0), solid_mat("VentCloth", (0.95, 0.9, 0.8), 0.5), 16, 10, scale=(1, 1, 0.45))
    adopt(cap, rig, (0, 0, 2.92))
    # Suspension lines from the gore ribs.
    gores = 16
    radius = 1.62
    for j in range(gores):
        ang = j / gores * math.tau
        rim_p = Vector((math.cos(ang) * radius, math.sin(ang) * radius, 1.85 + 0.02))
        riser = Vector((0.16 if j % 2 == 0 else -0.16, 0.0, 0.62))
        line = cable(rim_p, riser, sag=0.18)
        adopt(line, rig)
    build_skydiver(rig)
    pizza = make_pizza(0.34)
    pizza.rotation_euler = (math.radians(70), 0.2, 0.35)
    adopt(pizza, rig, (0.42, -0.58, 0.02))
    look = empty("Look")
    adopt(look, rig, (0, -0.2, 0.7))
    badge = add_cyl("Badge", 0.22, 0.02, (0, 0, 0), solid_mat("Badge", (0.98, 0.82, 0.15), 0.35, coat=0.4), rotation=(math.radians(78), 0, 0))
    adopt(badge, rig, (0, -1.15, 1.85))
    bpy.ops.object.text_add(location=(0, 0, 0), rotation=(math.radians(78), 0, 0))
    text = bpy.context.active_object
    text.data.body = "GoPizzaGo"
    text.data.align_x = "CENTER"
    text.data.size = 0.09
    text.data.extrude = 0.008
    text.data.materials.append(solid_mat("Logo", (0.7, 0.05, 0.06), 0.4))
    adopt(text, rig, (0, -1.18, 1.85))

    build_hills()
    cloud("C1", (-3.2, 2.5, 3.4), (2.4, 1.1, 0.7))
    cloud("C2", (3.4, 4.0, 3.8), (2.8, 1.2, 0.6))
    cloud("C3", (-1.2, 6.5, 4.2), (2.2, 0.9, 0.55))
    cloud("C4", (2.2, -1.5, 2.6), (1.6, 0.8, 0.45))

    rig.location = (0, 0, 2.4)
    rig.keyframe_insert("location", frame=1)
    rig.location = (0.15, 0.1, -0.35)
    rig.keyframe_insert("location", frame=FRAMES_N)
    rig.rotation_euler = (0.05, 0, -0.18)
    rig.keyframe_insert("rotation_euler", frame=1)
    rig.rotation_euler = (-0.04, 0.06, 0.16)
    rig.keyframe_insert("rotation_euler", frame=FRAMES_N // 2)
    rig.rotation_euler = (0.02, -0.03, -0.05)
    rig.keyframe_insert("rotation_euler", frame=FRAMES_N)

    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 32
    cam_data.dof.use_dof = True
    cam_data.dof.focus_object = look
    cam_data.dof.aperture_fstop = 5.6
    cam = bpy.data.objects.new("Camera", cam_data)
    link(cam)
    track_to(cam, look)
    cam.location = (2.4, -6.4, 2.8)
    cam.keyframe_insert("location", frame=1)
    cam.location = (1.8, -5.2, 1.7)
    cam.keyframe_insert("location", frame=FRAMES_N // 2)
    cam.location = (1.15, -4.3, 0.85)
    cam.keyframe_insert("location", frame=FRAMES_N)
    for obj in (rig, cam):
        action = obj.animation_data.action if obj.animation_data else None
        if not action:
            continue
        for fcurve in action.fcurves:
            for kp in fcurve.keyframe_points:
                kp.interpolation = "LINEAR"
    bpy.context.scene.camera = cam
    setup_render(os.path.join(FRAMES, "parachute"))
    os.makedirs(os.path.join(FRAMES, "parachute"), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(__file__), "parachute.blend"))


def flame_mesh(name, height, radius):
    bm = bmesh.new()
    segs = 12
    rings = 10
    for i in range(rings):
        t = i / (rings - 1)
        r = radius * math.sin(t * math.pi) ** 0.55 * (1.05 - t)
        if i == rings - 1:
            r = 0.004
        z = (t ** 0.85) * height
        for j in range(segs):
            a = j / segs * math.tau
            wob = 1 + 0.28 * math.sin(a * 3 + t * 8) + 0.12 * math.cos(a * 5)
            bm.verts.new((math.cos(a) * r * wob, math.sin(a) * r * wob, z))
    bm.verts.ensure_lookup_table()
    for i in range(rings - 1):
        for j in range(segs):
            j2 = (j + 1) % segs
            a = bm.verts[i * segs + j]
            b = bm.verts[i * segs + j2]
            c = bm.verts[(i + 1) * segs + j2]
            d = bm.verts[(i + 1) * segs + j]
            try:
                bm.faces.new((a, b, c, d))
            except ValueError:
                pass
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return mesh_from_bmesh(name, bm, flame_mat())


def cut_mouth(wall):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.78, depth=2.4, location=(0, -0.05, 0.78), rotation=(math.pi / 2, 0, 0))
    cutter = bpy.context.active_object
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.05, 0.38))
    box = bpy.context.active_object
    box.scale = (1.45, 2.6, 0.78)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.select_all(action="DESELECT")
    cutter.select_set(True)
    box.select_set(True)
    bpy.context.view_layer.objects.active = cutter
    bpy.ops.object.join()
    mod = wall.modifiers.new("Mouth", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    mod.solver = "EXACT"
    bpy.context.view_layer.objects.active = wall
    wall.select_set(True)
    bpy.ops.object.modifier_apply(modifier="Mouth")
    bpy.data.objects.remove(cutter, do_unlink=True)
    return wall


def build_oven():
    clear_scene()
    sky_world((0.05, 0.02, 0.015), (0.12, 0.04, 0.02), 0.15)
    brick = brick_mat(11, 0.25)
    soot = brick_mat(7, 0.72)
    hearth_m = brick_mat(5, 0.55)
    wood = wood_mat()
    char = solid_mat("Char", (0.07, 0.04, 0.03), 0.9)
    ember_m = solid_mat("Ember", (1.0, 0.45, 0.08), 0.4, emit=18, emit_color=(1, 0.4, 0.05))

    def open_dome(name, radius, location, material):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=72, ring_count=36, radius=radius, location=location)
        dome = bpy.context.active_object
        dome.name = name
        bpy.ops.object.mode_set(mode="EDIT")
        bm = bmesh.from_edit_mesh(dome.data)
        for v in bm.verts:
            # Drop the floor and the front so the mouth faces the camera.
            v.select = v.co.z < 0.02 or v.co.y < -0.42 * radius
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.select], context="VERTS")
        bmesh.update_edit_mesh(dome.data)
        bpy.ops.object.mode_set(mode="OBJECT")
        dome.data.materials.append(material)
        return smooth(dome)

    open_dome("Dome", 1.38, (0, 0.62, 0.0), brick)
    open_dome("DomeInner", 1.22, (0, 0.72, 0.0), soot)
    add_cube("Hearth", (3.6, 3.4, 0.08), (0, -0.15, -0.02), hearth_m)
    add_cube("Lintel", (2.2, 0.16, 0.09), (0, 0.05, 1.22), wood)

    for i, (x, rot) in enumerate(((-0.32, 0.4), (0.02, -0.2), (0.3, 0.7), (-0.08, 1.2))):
        add_cyl(f"Log{i}", 0.065, 0.48, (x, 0.85, 0.08), char, rotation=(0, math.pi / 2, rot), verts=12)

    for i, (x, y, z, h, r) in enumerate((
        (-0.28, 0.72, 0.1, 0.5, 0.09),
        (0.26, 0.7, 0.1, 0.58, 0.1),
        (0.02, 0.85, 0.08, 0.72, 0.08),
        (-0.12, 0.78, 0.08, 0.36, 0.06),
        (0.16, 0.76, 0.08, 0.34, 0.06),
    )):
        fl = flame_mesh(f"Flame{i}", h, r)
        fl.location = (x, y, z)
        base = fl.scale.copy()
        fl.keyframe_insert("scale", frame=1)
        fl.scale = (base.x * 1.15, base.y * 0.9, base.z * 1.25)
        fl.keyframe_insert("scale", frame=8 + i * 3)
        fl.scale = (base.x * 0.8, base.y * 1.1, base.z * 0.75)
        fl.keyframe_insert("scale", frame=18 + i * 2)
        fl.scale = base
        fl.keyframe_insert("scale", frame=FRAMES_N)
        for fcurve in fl.animation_data.action.fcurves:
            for kp in fcurve.keyframe_points:
                kp.interpolation = "BEZIER"

    for i in range(10):
        ember = add_sphere(f"Spark{i}", 0.015, (0, 0, 0), ember_m, 8, 6)
        x = -0.25 + (i % 5) * 0.12
        ember.location = (x, 0.85, 0.18)
        ember.keyframe_insert("location", frame=1)
        ember.location = (x + 0.05 * ((i % 3) - 1), 0.7, 0.7 + (i % 4) * 0.1)
        ember.keyframe_insert("location", frame=FRAMES_N)

    rig = empty("PeelRig", (0, -1.15, 0.16))
    board = add_cube("Peel", (0.72, 1.15, 0.028), (0, 0, 0), wood)
    handle = add_cube("Handle", (0.07, 0.85, 0.028), (0, 0, 0), wood)
    adopt(board, rig, (0, 0.15, 0))
    adopt(handle, rig, (0, -0.85, 0))
    pizza = make_pizza(0.48, bubbles=True)
    pizza.rotation_euler = (math.radians(58), 0, 0.04)
    adopt(pizza, rig, (0, 0.42, 0.1))

    rig.keyframe_insert("location", frame=1)
    rig.location = (0, -0.15, 0.16)
    rig.keyframe_insert("location", frame=int(FRAMES_N * 0.62))
    rig.location = (0, -0.95, 0.16)
    rig.keyframe_insert("location", frame=int(FRAMES_N * 0.82))
    # Leave the pizza inside when the peel comes back.
    pizza.keyframe_insert("location", frame=1)
    # pizza location is local to rig; animate a second empty instead.
    # Re-parent pizza to the world at the "in" pose by keyframing world via a holder.
    holder = empty("PizzaHold")
    # Keep pizza on the peel until it is inside, then hold it.
    # Simpler: pizza stays parented and the peel does not fully withdraw past the pizza.
    # The last key moves the peel back only a little so the pizza remains in the mouth.
    rig.location = (0, -0.55, 0.16)
    rig.keyframe_insert("location", frame=FRAMES_N)

    fire = bpy.data.lights.new("Fire", "POINT")
    fire.energy = 40
    fire.color = (1, 0.45, 0.12)
    fire.shadow_soft_size = 0.2
    fire_o = bpy.data.objects.new("FireLight", fire)
    link(fire_o)
    fire_o.location = (0, 0.35, 0.35)
    fire.energy = 30
    fire_o.data.keyframe_insert("energy", frame=1)
    fire.energy = 55
    fire_o.data.keyframe_insert("energy", frame=FRAMES_N // 3)
    fire.energy = 28
    fire_o.data.keyframe_insert("energy", frame=2 * FRAMES_N // 3)
    fire.energy = 90
    fire_o.data.keyframe_insert("energy", frame=FRAMES_N)

    warm = bpy.data.lights.new("Warm", "AREA")
    warm.energy = 30
    warm.size = 1.4
    warm.color = (1, 0.7, 0.4)
    warm_o = bpy.data.objects.new("Warm", warm)
    link(warm_o)
    warm_o.location = (0.4, -1.6, 0.8)
    look_at(warm_o, (0, 0, 0.4))

    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 32
    cam_data.dof.use_dof = True
    cam_data.dof.focus_object = pizza
    cam_data.dof.aperture_fstop = 2.8
    cam = bpy.data.objects.new("Camera", cam_data)
    link(cam)
    track_to(cam, pizza)
    cam.location = (0.85, -2.7, 0.72)
    cam.keyframe_insert("location", frame=1)
    cam.location = (0.35, -1.85, 0.58)
    cam.keyframe_insert("location", frame=int(FRAMES_N * 0.7))
    cam.location = (0.15, -1.35, 0.5)
    cam.keyframe_insert("location", frame=FRAMES_N)
    bpy.context.scene.camera = cam

    flash_m = solid_mat("Flash", (1, 0.62, 0.22), 0.4, emit=0, emit_color=(1, 0.7, 0.3))
    # Camera looks down local -Z, with Y up, so the card is wide in X and tall in Y.
    flash = add_cube("Flash", (8, 14, 0.02), (0, 0, 0), flash_m)
    adopt(flash, cam, (0, 0, -0.45))
    # Animate emission on the flash material.
    bsdf = flash_m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Emission Strength"].default_value = 0
    bsdf.inputs["Emission Strength"].keyframe_insert("default_value", frame=int(FRAMES_N * 0.8))
    bsdf.inputs["Emission Strength"].default_value = 8
    bsdf.inputs["Emission Strength"].keyframe_insert("default_value", frame=FRAMES_N)
    bsdf.inputs["Emission Color"].default_value = (1, 0.7, 0.28, 1)
    bsdf.inputs["Alpha"].default_value = 0
    flash_m.blend_method = "BLEND"
    bsdf.inputs["Alpha"].keyframe_insert("default_value", frame=int(FRAMES_N * 0.8))
    bsdf.inputs["Alpha"].default_value = 1
    bsdf.inputs["Alpha"].keyframe_insert("default_value", frame=FRAMES_N)

    setup_render(os.path.join(FRAMES, "oven"))
    os.makedirs(os.path.join(FRAMES, "oven"), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(__file__), "oven.blend"))


def setup_render(folder):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = W
    scene.render.resolution_y = H
    scene.render.resolution_percentage = 100
    scene.render.fps = FPS
    scene.frame_start = 1
    scene.frame_end = FRAMES_N
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = os.path.join(folder, "frame_")
    scene.render.film_transparent = False
    scene.eevee.taa_render_samples = SAMPLES
    scene.eevee.use_bloom = True
    scene.eevee.bloom_threshold = 0.85
    scene.eevee.bloom_intensity = 0.06
    scene.eevee.bloom_radius = 5.0
    scene.eevee.use_motion_blur = os.environ.get("GOPIZZA_BLUR", "1") == "1" and not STILL
    scene.render.use_motion_blur = scene.eevee.use_motion_blur
    scene.eevee.motion_blur_steps = 2
    scene.eevee.motion_blur_shutter = 0.4
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except (TypeError, ValueError):
        pass
    scene.view_settings.exposure = 0.0


def render_still(name):
    scene = bpy.context.scene
    scene.frame_set(int(STILL))
    scene.render.filepath = f"/tmp/gopizzago-still-{name}.png"
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    print("STILL", scene.render.filepath)


def encode(name):
    folder = os.path.join(FRAMES, name)
    pattern = os.path.join(folder, "frame_%04d.png")
    mp4 = os.path.join(PUBLIC, f"{name}.mp4")
    webm = os.path.join(PUBLIC, f"{name}.webm")
    jpg = os.path.join(PUBLIC, f"{name}.jpg")
    crf = "21"
    subprocess.check_call(
        [
            "ffmpeg", "-y", "-framerate", str(FPS), "-i", pattern,
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", crf, "-preset", "slow",
            "-an", "-movflags", "+faststart", mp4,
        ]
    )
    size = os.path.getsize(mp4)
    if size > 1_500_000 or size < 400_000:
        # Push toward the requested 400 KB–1.5 MB window.
        crf = "26" if size > 1_500_000 else "17"
        subprocess.check_call(
            [
                "ffmpeg", "-y", "-framerate", str(FPS), "-i", pattern,
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", crf, "-preset", "slow",
                "-an", "-movflags", "+faststart", mp4,
            ]
        )
    subprocess.check_call(
        [
            "ffmpeg", "-y", "-i", mp4,
            "-c:v", "libvpx-vp9", "-b:v", "1600k", "-crf", "28", "-deadline", "good", "-an",
            webm,
        ]
    )
    webm_size = os.path.getsize(webm)
    if webm_size > 1_500_000 or webm_size < 400_000:
        bitrate = "700k" if webm_size > 1_500_000 else "1400k"
        subprocess.check_call(
            [
                "ffmpeg", "-y", "-i", mp4,
                "-c:v", "libvpx-vp9", "-b:v", bitrate, "-crf", "30", "-deadline", "good", "-an",
                webm,
            ]
        )
    mid = os.path.join(folder, f"frame_{FRAMES_N // 2:04d}.png")
    subprocess.check_call(["ffmpeg", "-y", "-i", mid, "-q:v", "3", jpg])
    print("SIZE", name, os.path.getsize(mp4), os.path.getsize(webm))


def render_anim(name):
    bpy.ops.render.render(animation=True)
    encode(name)


if __name__ == "__main__":
    which = os.environ.get("GOPIZZA_SCENE", "both")
    if which in ("both", "parachute"):
        build_parachute()
        if STILL:
            render_still("parachute")
        else:
            render_anim("parachute")
    if which in ("both", "oven"):
        build_oven()
        if STILL:
            render_still("oven")
        else:
            render_anim("oven")
