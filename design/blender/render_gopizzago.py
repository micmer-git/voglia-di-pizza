"""Headless Blender scenes for GoPizzaGo transitions.

Run:
  blender --background --python design/blender/render_gopizzago.py

Writes design/blender/*.blend, PNG frames under /tmp/gopizzago-frames,
and public/gopizzago/parachute.webm, parachute.mp4, parachute.jpg,
oven.webm, oven.mp4, oven.jpg.
"""

import math
import os
import subprocess

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PUBLIC = os.path.join(ROOT, "public", "gopizzago")
FRAMES = "/tmp/gopizzago-frames"
os.makedirs(PUBLIC, exist_ok=True)
os.makedirs(FRAMES, exist_ok=True)

W, H = 720, 960
FPS = 24
SECONDS = 2.5
FRAMES_N = int(FPS * SECONDS)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, color, rough=0.5, emission=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = False
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    if emission > 0 and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (*color, 1)
        bsdf.inputs["Emission Strength"].default_value = emission
    elif emission > 0 and "Emission" in bsdf.inputs:
        bsdf.inputs["Emission"].default_value = (*color, 1)
        bsdf.inputs["Emission Strength"].default_value = emission
    return m


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_cylinder(name, radius, depth, location, material, verts=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(material)
    return obj


def add_uv_sphere(name, radius, location, material, segments=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(material)
    return obj


def add_cube(name, scale, location, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(material)
    return obj


def adopt(obj, parent, local):
    obj.parent = parent
    obj.matrix_parent_inverse = parent.matrix_world.inverted()
    obj.location = local


def pizza_mesh(parent, local):
    crust = mat("Crust", (0.72, 0.38, 0.14), 0.7)
    rim = mat("Rim", (0.45, 0.2, 0.08), 0.55)
    top = mat("Sauce", (0.86, 0.12, 0.08), 0.35)
    cheese = mat("Cheese", (0.98, 0.9, 0.62), 0.25)
    basil = mat("Basil", (0.12, 0.55, 0.16), 0.4)
    x, y, z = local
    base = add_cylinder("PizzaBase", 0.55, 0.07, (0, 0, 0), crust)
    edge = add_cylinder("PizzaRim", 0.6, 0.045, (0, 0, 0), rim)
    disc = add_cylinder("PizzaTop", 0.46, 0.03, (0, 0, 0), top)
    blob = add_uv_sphere("Mozza", 0.12, (0, 0, 0), cheese, 16, 10)
    blob.scale = (1.4, 1.0, 0.35)
    leaf = add_uv_sphere("BasilDot", 0.06, (0, 0, 0), basil, 12, 8)
    adopt(base, parent, (x, y, z))
    adopt(edge, parent, (x, y, z + 0.02))
    adopt(disc, parent, (x, y, z + 0.045))
    adopt(blob, parent, (x + 0.12, y + 0.04, z + 0.07))
    adopt(leaf, parent, (x - 0.12, y - 0.05, z + 0.07))
    return base


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
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = 12
        if hasattr(scene.eevee, "use_bloom"):
            scene.eevee.use_bloom = True
    scene.view_settings.view_transform = "Filmic"
    scene.view_settings.look = "Medium High Contrast"


def world(color):
    world = bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*color, 1)
    bg.inputs["Strength"].default_value = 1.0


def sun(energy, rot):
    light = bpy.data.lights.new("Sun", "SUN")
    light.energy = energy
    obj = bpy.data.objects.new("Sun", light)
    bpy.context.collection.objects.link(obj)
    obj.rotation_euler = rot
    return obj


def camera(location, target, lens=35):
    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = lens
    cam = bpy.data.objects.new("Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = location
    look_at(cam, target)
    bpy.context.scene.camera = cam
    return cam


def smooth(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    obj.select_set(False)


def hemisphere(name, radius, location, material, scale):
    obj = add_uv_sphere(name, radius, location, material, 48, 24)
    obj.scale = scale
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(scale=True)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for v in bm.verts:
        if v.co.z < -0.02:
            v.select = True
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.select], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    solid = obj.modifiers.new("Solid", "SOLIDIFY")
    solid.thickness = 0.06
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier="Solid")
    obj.select_set(False)
    smooth(obj)
    return obj


def build_parachute():
    clear_scene()
    world((0.55, 0.78, 0.98))
    sun(4.2, (0.8, 0.15, 0.6))
    fill = bpy.data.lights.new("Fill", "AREA")
    fill.energy = 250
    fill.size = 4
    fobj = bpy.data.objects.new("Fill", fill)
    bpy.context.collection.objects.link(fobj)
    fobj.location = (-2, -3, 2)
    rig = bpy.data.objects.new("Rig", None)
    bpy.context.collection.objects.link(rig)
    red = mat("ChuteRed", (0.86, 0.1, 0.12), 0.35)
    cream = mat("ChuteCream", (0.98, 0.93, 0.82), 0.35)
    suit = mat("Suit", (0.12, 0.16, 0.28), 0.45)
    skin = mat("Skin", (0.93, 0.7, 0.52), 0.4)
    grass = mat("Grass", (0.18, 0.55, 0.22), 0.8)
    cloud = mat("Cloud", (1, 1, 1), 0.9)
    dome = add_uv_sphere("Canopy", 1.45, (0, 0, 0), red, 48, 24)
    dome.scale = (1.15, 1.15, 0.32)
    smooth(dome)
    band = add_cylinder("Band", 1.05, 0.05, (0, 0, 0), cream, 48)
    adopt(dome, rig, (0, 0, 2.05))
    adopt(band, rig, (0, 0, 1.82))
    head = add_uv_sphere("Head", 0.2, (0, 0, 1.05), skin, 24, 16)
    helmet = add_uv_sphere("Helmet", 0.22, (0, 0, 1.12), red, 24, 16)
    helmet.scale = (1, 1, 0.7)
    body = add_uv_sphere("Torso", 0.28, (0, 0, 0.62), suit, 24, 16)
    body.scale = (0.85, 0.55, 1.15)
    for name, loc, rot in (
        ("ArmL", (-0.38, 0, 0.7), (0, 0.9, 0.4)),
        ("ArmR", (0.38, 0, 0.7), (0, -0.9, -0.4)),
        ("LegL", (-0.12, 0, 0.22), (0.2, 0, 0.15)),
        ("LegR", (0.12, 0, 0.22), (0.2, 0, -0.15)),
    ):
        limb = add_cylinder(name, 0.06, 0.42, loc, suit, 12)
        limb.rotation_euler = rot
        limb.parent = rig
        limb.matrix_parent_inverse = rig.matrix_world.inverted()
        smooth(limb)
    for obj in (head, helmet, body):
        obj.parent = rig
        obj.matrix_parent_inverse = rig.matrix_world.inverted()
        smooth(obj)
    cord = mat("Cord", (0.96, 0.96, 0.92), 0.4)
    for i, (x, y) in enumerate(((-1.05, 0), (1.05, 0), (0, -1.05), (0, 1.05), (-0.7, -0.7), (0.7, 0.7))):
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.012, depth=1.35, location=(x * 0.45, y * 0.45, 1.55))
        c = bpy.context.active_object
        c.data.materials.append(cord)
        c.rotation_euler = (y * 0.35, -x * 0.35, 0)
        c.parent = rig
        c.matrix_parent_inverse = rig.matrix_world.inverted()
    pizza_mesh(rig, (0, 0.15, -0.02))
    ground = add_cube("Ground", (8, 8, 0.08), (0, 0, -2.6), grass)
    for i, loc in enumerate(((-2.2, 1.5, 3.2), (2.4, 2.2, 3.6), (-1.2, 3, 4.2))):
        cl = add_uv_sphere(f"Cloud{i}", 0.55, loc, cloud, 16, 10)
        cl.scale = (1.6, 0.7, 0.5)
        smooth(cl)
    rig.location = (0, 0, 1.6)
    rig.keyframe_insert("location", frame=1)
    rig.location = (0.05, 0, -1.15)
    rig.keyframe_insert("location", frame=FRAMES_N)
    rig.rotation_euler = (0.08, 0, -0.2)
    rig.keyframe_insert("rotation_euler", frame=1)
    rig.rotation_euler = (-0.05, 0.05, 0.18)
    rig.keyframe_insert("rotation_euler", frame=FRAMES_N)
    camera((0.35, -5.1, 0.35), (0, 0, 1.55), 34)
    setup_render(os.path.join(FRAMES, "parachute"))
    os.makedirs(os.path.join(FRAMES, "parachute"), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(__file__), "parachute.blend"))


def cut_arch():
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.15, 1.35))
    wall = bpy.context.active_object
    wall.name = "OvenWall"
    wall.scale = (3.4, 0.7, 2.7)
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1.05, depth=2.2, location=(0, 0.15, 1.15), rotation=(math.pi / 2, 0, 0))
    cutter = bpy.context.active_object
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.15, 0.55))
    box = bpy.context.active_object
    box.scale = (1.9, 2.4, 1.1)
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.object.select_all(action="DESELECT")
    cutter.select_set(True)
    box.select_set(True)
    bpy.context.view_layer.objects.active = cutter
    bpy.ops.object.join()
    mod = wall.modifiers.new("Cut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    if hasattr(mod, "solver"):
        mod.solver = "EXACT"
    bpy.context.view_layer.objects.active = wall
    wall.select_set(True)
    bpy.ops.object.modifier_apply(modifier="Cut")
    bpy.data.objects.remove(cutter, do_unlink=True)
    return wall


def build_oven():
    clear_scene()
    world((0.08, 0.03, 0.02))
    sun(0.6, (1.2, 0.1, -0.2))
    brick = mat("Brick", (0.55, 0.18, 0.08), 0.75)
    soot = mat("Soot", (0.08, 0.04, 0.03), 0.9)
    wood = mat("Wood", (0.72, 0.42, 0.16), 0.45)
    flame_m = mat("Flame", (1.0, 0.32, 0.05), 0.3, emission=18.0)
    ember = mat("Ember", (1.0, 0.72, 0.2), 0.2, emission=28.0)
    wall = cut_arch()
    wall.data.materials.append(brick)
    add_cube("Back", (2.6, 0.12, 1.8), (0, 0.85, 1.0), soot)
    add_cube("Hearth", (3.6, 2.8, 0.08), (0, -0.4, 0.02), soot)
    add_cube("Lintel", (2.6, 0.28, 0.16), (0, -0.2, 2.15), brick)
    for i, x in enumerate((-0.55, -0.15, 0.25, 0.6)):
        flame = add_uv_sphere(f"Flame{i}", 0.1, (x, 0.55, 0.22 + (i % 2) * 0.05), ember if i % 2 == 0 else flame_m, 16, 10)
        flame.scale = (0.45, 0.35, 1.3)
        smooth(flame)
        flame.keyframe_insert("scale", frame=1)
        flame.scale = (0.7, 0.45, 2.3)
        flame.keyframe_insert("scale", frame=FRAMES_N // 2)
        flame.scale = (0.5, 0.35, 1.5)
        flame.keyframe_insert("scale", frame=FRAMES_N)
    peel = add_cube("Peel", (0.55, 1.5, 0.03), (0, 0, 0), wood)
    handle = add_cube("Handle", (0.08, 0.9, 0.03), (0, 0, 0), wood)
    rigp = bpy.data.objects.new("PeelRig", None)
    bpy.context.collection.objects.link(rigp)
    rigp.location = (0, -1.55, 0.2)
    adopt(peel, rigp, (0, 0.15, 0))
    adopt(handle, rigp, (0, -0.95, 0))
    pizza_mesh(rigp, (0, 0.45, 0.06))
    rigp.keyframe_insert("location", frame=1)
    rigp.location = (0, -0.35, 0.2)
    rigp.keyframe_insert("location", frame=int(FRAMES_N * 0.72))
    rigp.location = (0, -1.2, 0.2)
    rigp.keyframe_insert("location", frame=FRAMES_N)
    point = bpy.data.lights.new("Fire", "POINT")
    point.energy = 180
    point.color = (1, 0.45, 0.12)
    pobj = bpy.data.objects.new("FireLight", point)
    bpy.context.collection.objects.link(pobj)
    pobj.location = (0, 0.35, 0.55)
    camera((0.15, -3.6, 1.05), (0, 0.2, 0.95), 32)
    setup_render(os.path.join(FRAMES, "oven"))
    os.makedirs(os.path.join(FRAMES, "oven"), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(__file__), "oven.blend"))


def render_and_encode(name):
    folder = os.path.join(FRAMES, name)
    bpy.ops.render.render(animation=True)
    webm = os.path.join(PUBLIC, f"{name}.webm")
    mp4 = os.path.join(PUBLIC, f"{name}.mp4")
    jpg = os.path.join(PUBLIC, f"{name}.jpg")
    pattern = os.path.join(folder, "frame_%04d.png")
    subprocess.check_call(
        [
            "ffmpeg", "-y", "-framerate", str(FPS), "-i", pattern,
            "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "38", "-an", "-deadline", "good",
            webm,
        ]
    )
    subprocess.check_call(
        [
            "ffmpeg", "-y", "-i", webm,
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "30", "-an", "-movflags", "+faststart",
            mp4,
        ]
    )
    mid = os.path.join(folder, f"frame_{FRAMES_N // 2:04d}.png")
    subprocess.check_call(["ffmpeg", "-y", "-i", mid, "-q:v", "4", jpg])


if __name__ == "__main__":
    which = os.environ.get("GOPIZZA_SCENE", "both")
    if which in ("both", "parachute"):
        build_parachute()
        render_and_encode("parachute")
    if which in ("both", "oven"):
        build_oven()
        render_and_encode("oven")
