import bpy, math, random, os, json
from mathutils import Vector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets')
os.makedirs(OUT, exist_ok=True)
previous = bpy.context.window.scene
scene = bpy.data.scenes.new('Living Material World 20260907')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
random.seed(73)
groups = {}

def material(name, color, metal=0, rough=.5, emission=0, transmission=0):
    m = bpy.data.materials.new('LMW_' + name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    p.inputs['Coat Weight'].default_value = .35 if metal else .1
    p.inputs['Transmission Weight'].default_value = transmission
    p.inputs['Emission Color'].default_value = (*color, 1)
    p.inputs['Emission Strength'].default_value = emission
    return m

stone = material('Basalt', (.055,.12,.15), .3, .56)
edge = material('Cut_faces', (.095,.22,.25), .45,.34)
pearl = material('Pearl', (.38,.69,.64), .6,.2)
violet = material('Titanium', (.24,.13,.38), .8,.24)
glow = material('Signal', (.12,.8,.65), .35,.26,1.4)
gold = material('Warm_alloy', (.6,.32,.12), .8,.27)
glass = material('Membrane', (.28,.56,.63), .12,.16,0,.62)
grassmat = material('Blades', (.07,.32,.26), .25,.52)

def mesh(group, name, verts, faces, mat):
    data = bpy.data.meshes.new('LMW_' + name)
    data.from_pydata(verts, [], faces); data.update()
    ob = bpy.data.objects.new('LMW_' + name, data)
    scene.collection.objects.link(ob); data.materials.append(mat)
    uv = data.uv_layers.new(name='UVMap')
    for loop in data.loops:
        v = data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = (v.x*.1,v.y*.1)
    groups.setdefault(group, []).append(ob)
    return ob

def cube(group,name,loc,size,mat,rot=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    ob=bpy.context.object; ob.name='LMW_'+name; ob.scale=size; ob.rotation_euler.z=rot
    ob.data.materials.append(mat)
    bevel=ob.modifiers.new('Soft cut edges','BEVEL'); bevel.width=.055; bevel.segments=2
    groups.setdefault(group,[]).append(ob)
    return ob

def ring(group,name,radius,tube,loc,rot,mat,segments=80):
    bpy.ops.mesh.primitive_torus_add(major_segments=segments,minor_segments=6,location=loc,major_radius=radius,minor_radius=tube,rotation=rot)
    ob=bpy.context.object; ob.name='LMW_'+name; ob.data.materials.append(mat)
    groups.setdefault(group,[]).append(ob)
    return ob

# Main walking surface: gentle designed facets, with a deep cut island edge.
v=[]
for j in range(11):
    for i in range(9):
        x=-20+i*5; y=-25+j*5
        h=.09+.055*math.sin(x*.19)*math.cos(y*.12)
        v.append((x,y,h))
f=[]
for j in range(10):
    for i in range(8):
        a=j*9+i
        f.extend([(a,a+1,a+10),(a,a+10,a+9)])
mesh('terrain-main','Plateau',v,f,stone)
border=[(-20,-25),(-5,-25),(10,-25),(20,-25),(20,-10),(20,5),(20,25),(0,25),(-20,25),(-20,5)]
sv=[(x,y,.06) for x,y in border]+[(x*.9,y*.9,-4-random.random()*2) for x,y in border]
sf=[]; n=len(border)
for i in range(n): sf.extend([(i,(i+1)%n,n+(i+1)%n),(i,n+(i+1)%n,n+i)])
mesh('terrain-main','Island_cut',sv,sf,edge)
for k,(x,y,h) in enumerate([(-24,8,6),(-26,19,9),(24,20,5),(25,-14,3)]):
    verts=[(x-5,y-8,-2),(x+4,y-7,-2),(x+5,y+7,-2),(x-4,y+8,-2),(x-2,y-3,h),(x+1,y+5,h*.75)]
    mesh('terrain-ridges','Ridge_'+str(k),verts,[(0,1,4),(1,2,5,4),(2,3,5),(3,0,4,5)],stone)

for i in range(5):
    cube('monolith','Monolith_segment_'+str(i),(.35*math.sin(i*2),0,1.45+i*3.05),(3.7,2.1,2.8),violet if i%2 else pearl,.035*(i-2))
    cube('monolith','Monolith_seam_'+str(i),(.35*math.sin(i*2),-1.06,.15+i*3.05),(3.3,.025,.035),glow)

def membrane(group,name,sx,sy,sz,mat):
    verts=[]; faces=[]; rows=20; cols=40
    for j in range(rows+1):
        t=math.pi*j/rows
        for i in range(cols):
            a=2*math.pi*i/cols
            w=1+.1*math.sin(3*a+2*t)+.065*math.cos(5*t-a)
            verts.append((sx*math.sin(t)*math.cos(a)*w,sy*math.sin(t)*math.sin(a)*w,sz*math.cos(t)+.12*math.sin(3*a)*math.sin(t)))
    for j in range(rows):
        for i in range(cols):
            a=j*cols+i; b=j*cols+(i+1)%cols
            faces.append((a,b,b+cols,a+cols))
    ob=mesh(group,name,verts,faces,mat)
    for p in ob.data.polygons:p.use_smooth=True
    return ob

membrane('node-core','Core',1.15,.85,1.3,pearl)
for i in range(4):ring('node-core','Core_ring_'+str(i),2.1+i*.23,.045 if i%2 else .075,(0,0,0),(.55+i*.63,.25+i*.45,i*.6),gold if i==1 else pearl)
for i in range(5):
    a=i*math.tau/5
    ring('node-core','Core_satellite_'+str(i),.17,.055,(3*math.cos(a),0,3*math.sin(a)),(math.pi/2,0,0),glow,6)
membrane('membrane','Membrane',2.7,.62,1.8,glass)

# Shallow dished metal, asymmetric plate architecture and node components.
verts=[(0,0,.15)]; faces=[]
for j in range(1,9):
    r=3.3*j/8
    for i in range(64):verts.append((r*math.cos(i*math.tau/64),r*math.sin(i*math.tau/64),.15+.42*(r/3.3)**2))
for i in range(64):faces.append((0,1+i,1+(i+1)%64))
for j in range(7):
    for i in range(64):
        a=1+j*64+i;b=1+j*64+(i+1)%64
        faces.append((a,b,b+64,a+64))
mesh('anisotropic-disc','Disc',verts,faces,gold)
for i in range(5):cube('volume-crystal','Volume_plate_'+str(i),((i-2)*.5,.2*math.sin(i),2.5+i*.3),(.15,2.1,5+i*.4),glass,.25*(i-2))
ring('node-parts','Hex_node',.45,.09,(0,0,0),(math.pi/2,0,0),glow,6)
ring('node-parts','Node_outer_frame',.68,.025,(0,0,0),(math.pi/2,0,0),pearl,6)

verts=[];faces=[]
for i in range(110):
    x=random.uniform(-1.5,1.5);y=random.uniform(-1.2,1.2);h=random.uniform(.2,.8);a=random.random()*math.tau
    dx=.045*math.cos(a);dy=.045*math.sin(a);base=len(verts)
    verts.extend([(x-dx,y-dy,0),(x+dx,y+dy,0),(x+dx+.1,y+dy,h*.55),(x-dx+.1,y-dy,h*.55),(x+.16,y,h)])
    faces.extend([(base,base+1,base+2,base+3),(base+3,base+2,base+4)])
mesh('grass-cluster','Wind_blades',verts,faces,grassmat)
for i in range(5):
    v=[]; f=[]
    for j in range(13):
        z=j*.22; a=j*.2+i; x=i*.22+.24*math.sin(a); y=.22*math.cos(a)
        v.extend([(x-.07,y,z),(x+.07,y,z)])
    for j in range(12):f.append((j*2,j*2+1,j*2+3,j*2+2))
    mesh('abstract-vegetation','Ribbon_'+str(i),v,f,pearl)
ring('distant-ring','Distant_ring',16,.27,(0,0,0),(math.pi/2,.2,-.1),pearl,96)
ring('distant-ring','Distant_ring_inner',14.7,.05,(0,0,0),(math.pi/2,.2,-.1),glow,96)
for i in range(3):cube('distant-architecture','Frame_pillar_'+str(i),(i*7,0,14+i*2),(1,1,28+i*4),edge)
cube('distant-architecture','Frame_bridge',(7,0,29),(18,1,.7),pearl)
for i in range(8):
    a=i*math.tau/8;x=70*math.cos(a);y=70*math.sin(a);h=random.uniform(7,18)
    mesh('terrain-distant','Distant_ridge_'+str(i),[(x-15,y-8,-7),(x+16,y-8,-7),(x+12,y+10,-7),(x-9,y+14,-7),(x-3,y,h)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],stone)

manifest=[]
try:
    for name,objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objects:ob.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
        bpy.ops.object.origin_set(type='ORIGIN_CENTER_OF_VOLUME',center='BOUNDS')
        bpy.context.view_layer.update()
        path=os.path.join(OUT,name+'.glb')
        bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,use_active_scene=True,export_materials='EXPORT',export_apply=True,export_yup=True)
        manifest.append({'name':name,'path':path,'bytes':os.path.getsize(path),'objects':len(objects)})
    bpy.data.libraries.write(os.path.join(OUT,'living-material-world.blend'),{scene},fake_user=True)
    with open(os.path.join(OUT,'manifest.json'),'w') as fp:json.dump(manifest,fp,indent=2)
finally:
    bpy.context.window.scene=previous
result={'assets':manifest,'source_scene':scene.name,'restored_scene':previous.name}
