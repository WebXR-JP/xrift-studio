"""Native GLES3/Mesa reference rendering. NOT a WebGL/Three.js integration test."""
import ctypes as C, os, json, re, math
from pathlib import Path
import numpy as np
from PIL import Image
os.environ.setdefault('EGL_PLATFORM','surfaceless');os.environ.setdefault('LIBGL_ALWAYS_SOFTWARE','1')
E=C.CDLL('libEGL.so.1');G=C.CDLL('libGL.so.1')
i=C.c_int;u=C.c_uint;f=C.c_float;p=C.c_void_p

def fn(lib,n,rest,args):
    o=getattr(lib,n);o.restype=rest;o.argtypes=args;return o
for n,rt,ar in [('eglGetDisplay',p,[p]),('eglInitialize',u,[p,p,p]),('eglBindAPI',u,[u]),('eglChooseConfig',u,[p,p,p,i,p]),('eglCreatePbufferSurface',p,[p,p,p]),('eglCreateContext',p,[p,p,p,p]),('eglMakeCurrent',u,[p,p,p,p]),('eglGetError',u,[])]:fn(E,n,rt,ar)
for n,rt,ar in [
('glGetString',C.c_char_p,[u]),('glCreateShader',u,[u]),('glShaderSource',None,[u,i,p,p]),('glCompileShader',None,[u]),('glGetShaderiv',None,[u,u,p]),('glGetShaderInfoLog',None,[u,i,p,p]),('glCreateProgram',u,[]),('glAttachShader',None,[u,u]),('glLinkProgram',None,[u]),('glGetProgramiv',None,[u,u,p]),('glGetProgramInfoLog',None,[u,i,p,p]),('glDeleteShader',None,[u]),('glUseProgram',None,[u]),('glGetUniformLocation',i,[u,C.c_char_p]),('glUniform1f',None,[i,f]),('glUniform2fv',None,[i,i,p]),('glUniform3fv',None,[i,i,p]),('glUniform4fv',None,[i,i,p]),('glUniformMatrix3fv',None,[i,i,u,p]),('glUniformMatrix4fv',None,[i,i,u,p]),
('glGenBuffers',None,[i,p]),('glBindBuffer',None,[u,u]),('glBufferData',None,[u,C.c_ssize_t,p,u]),('glGetAttribLocation',i,[u,C.c_char_p]),('glEnableVertexAttribArray',None,[u]),('glVertexAttribPointer',None,[u,i,u,u,i,p]),('glDrawElements',None,[u,i,u,p]),('glViewport',None,[i,i,i,i]),('glClearColor',None,[f,f,f,f]),('glClear',None,[u]),('glEnable',None,[u]),('glDisable',None,[u]),('glDepthMask',None,[u]),('glBlendFunc',None,[u,u]),('glReadPixels',None,[i,i,i,i,u,u,p]),('glFinish',None,[]),('glGetError',u,[])]:fn(G,n,rt,ar)
class Renderer:
    def __init__(self,catalog,lab,width=768,height=432):
        self.width,self.height=width,height
        self.display=E.eglGetDisplay(None);a,b=i(),i();assert E.eglInitialize(self.display,C.byref(a),C.byref(b))
        assert E.eglBindAPI(0x30A0)
        attrs=(i*15)(0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3025,24,0x3033,1,0x3040,0x40,0x3038)
        config=p();count=i();assert E.eglChooseConfig(self.display,attrs,C.byref(config),1,C.byref(count)) and count.value
        self.surface=E.eglCreatePbufferSurface(self.display,config,(i*5)(0x3057,width,0x3056,height,0x3038))
        self.context=E.eglCreateContext(self.display,config,None,(i*3)(0x3098,3,0x3038))
        assert self.surface and self.context and E.eglMakeCurrent(self.display,self.surface,self.surface,self.context),hex(E.eglGetError())
        self.renderer=G.glGetString(0x1F01).decode();self.version=G.glGetString(0x1F02).decode()
        self.entries=json.loads(Path(catalog).read_text())['entries'];self.cache={};self.errors=[]
        src=Path(lab).read_text();self.vprefix=re.search(r'const VERT_PREFIX = `([\s\S]*?)`;',src)[1];self.fprefix=re.search(r'const FRAG_PREFIX = `([\s\S]*?)`;',src)[1]
        self.grids={1:self.grid(1),128:self.grid(128)}
        self.bed=self.program(self.vprefix+'uniform float bedHeight;void main(){vec3 p=position;p.y=bedHeight;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.0);}',self.fprefix+'uniform vec3 color;void main(){gl_FragColor=vec4(linearToSRGB(ACESFilmicToneMapping(color)),1.0);}')
    def shader(self,type,source):
        sh=G.glCreateShader(type);text=C.c_char_p(source.encode());G.glShaderSource(sh,1,C.byref(text),None);G.glCompileShader(sh);ok=i();G.glGetShaderiv(sh,0x8B81,C.byref(ok))
        if not ok.value:
            log=C.create_string_buffer(32000);G.glGetShaderInfoLog(sh,len(log),None,log);raise RuntimeError(log.value.decode())
        return sh
    def program(self,vertex,fragment):
        v=self.shader(0x8B31,vertex);f=self.shader(0x8B30,fragment);pr=G.glCreateProgram();G.glAttachShader(pr,v);G.glAttachShader(pr,f);G.glLinkProgram(pr);G.glDeleteShader(v);G.glDeleteShader(f);ok=i();G.glGetProgramiv(pr,0x8B82,C.byref(ok))
        if not ok.value:
            log=C.create_string_buffer(32000);G.glGetProgramInfoLog(pr,len(log),None,log);raise RuntimeError(log.value.decode())
        return pr
    def chunks(self,s):
        replacements={'fog_pars_vertex':'#ifdef USE_FOG\nout float vFogDepth;\n#endif','fog_vertex':'#ifdef USE_FOG\nvFogDepth=-mvPosition.z;\n#endif','fog_pars_fragment':'#ifdef USE_FOG\nin float vFogDepth;\nuniform vec3 fogColor;\nuniform float fogNear;\nuniform float fogFar;\n#endif','fog_fragment':'#ifdef USE_FOG\ngl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,smoothstep(fogNear,fogFar,vFogDepth));\n#endif','tonemapping_fragment':'gl_FragColor.rgb=ACESFilmicToneMapping(gl_FragColor.rgb);','colorspace_fragment':'gl_FragColor.rgb=linearToSRGB(gl_FragColor.rgb);'}
        return re.sub(r'#include\s*<([^>]+)>',lambda m:replacements[m[1]],s)
    def preset_program(self,e,fog):
        defines=e['shader']['variants'][0]['defines'];key=json.dumps([defines,fog],sort_keys=True)
        if key not in self.cache:
            d=''.join(f'#define {k} {v}\n' for k,v in defines.items())+('#define USE_FOG\n' if fog else '')
            self.cache[key]=self.program(self.vprefix+d+self.chunks(e['shader']['vertexShader']),self.fprefix+d+self.chunks(e['shader']['fragmentShader']))
        return self.cache[key]
    def grid(self,n):
        pts=np.array([[(x/n-.5)*120,0,(z/n-.5)*120,0,1,0] for z in range(n+1) for x in range(n+1)],dtype=np.float32)
        idx=[]
        for z in range(n):
            for x in range(n):
                a=z*(n+1)+x;b=a+1;c=a+n+1;d=c+1;idx.extend([a,c,b,b,c,d])
        indices=np.array(idx,dtype=np.uint32);vb=u();ib=u();G.glGenBuffers(1,C.byref(vb));G.glGenBuffers(1,C.byref(ib))
        G.glBindBuffer(0x8892,vb);G.glBufferData(0x8892,pts.nbytes,pts.ctypes.data,0x88E4);G.glBindBuffer(0x8893,ib);G.glBufferData(0x8893,indices.nbytes,indices.ctypes.data,0x88E4)
        return vb.value,ib.value,len(indices)
    def uniform(self,pr,name,value):
        loc=G.glGetUniformLocation(pr,name.encode())
        if loc<0:return
        if np.isscalar(value):G.glUniform1f(loc,float(value));return
        a=np.ascontiguousarray(value,dtype=np.float32)
        if a.size in (9,16):getattr(G,'glUniformMatrix'+str(3 if a.size==9 else 4)+'fv')(loc,1,False,a.ctypes.data)
        else:getattr(G,'glUniform'+str(a.size)+'fv')(loc,1,a.ctypes.data)
    @staticmethod
    def rgb(s,linear=True):
        a=np.array([int(s[i:i+2],16)/255 for i in (1,3,5)])
        return np.where(a<=.04045,a/12.92,((a+.055)/1.055)**2.4) if linear else a
    def draw_geometry(self,pr,grid):
        vb,ib,count=grid;G.glBindBuffer(0x8892,vb);G.glBindBuffer(0x8893,ib)
        for name,offset in [('position',0),('normal',12)]:
            loc=G.glGetAttribLocation(pr,name.encode())
            if loc>=0:G.glEnableVertexAttribArray(loc);G.glVertexAttribPointer(loc,3,0x1406,False,24,offset)
        G.glDrawElements(0x0004,count,0x1405,None)
    def render(self,index,time=12.5,values=None,wind=1,fog=False,mode=0):
        e=self.entries[index];v={n:u['value'] for n,u in e['shader']['uniforms'].items()};v.update(values or {});v.update(uTime=time,uWindSpeed=wind,uWindTurbulence=.25)
        eye=np.array([3,16,10] if mode==1 else [7,-2,10] if mode==2 else [8,5.6,12]);target=np.array([0,0,-4] if mode==1 else [0,0,-10]);z=eye-target;z=z/np.linalg.norm(z);x=np.cross([0,1,0],z);x/=np.linalg.norm(x);y=np.cross(z,x)
        view=np.eye(4);view[:3,:3]=np.array([x,y,z]);view[:3,3]=-view[:3,:3]@eye
        f=1/math.tan(math.radians(44)/2);near=.1;far=500;proj=np.zeros((4,4));proj[0,0]=f/(self.width/self.height);proj[1,1]=f;proj[2,2]=(far+near)/(near-far);proj[2,3]=2*far*near/(near-far);proj[3,2]=-1
        G.glViewport(0,0,self.width,self.height);G.glClearColor(*self.rgb(v['uHorizonColor'],False),1);G.glDepthMask(True);G.glClear(0x4000|0x0100);G.glEnable(0x0B71);G.glDisable(0x0B44);G.glDisable(0x0BE2)
        G.glUseProgram(self.bed);self.uniform(self.bed,'viewMatrix',view.T);self.uniform(self.bed,'projectionMatrix',proj.T);self.uniform(self.bed,'bedHeight',-.8);self.uniform(self.bed,'color',self.rgb('#7b817a'))
        if mode!=2:self.draw_geometry(self.bed,self.grids[1])
        pr=self.preset_program(e,fog);G.glUseProgram(pr)
        for n,a in [('modelMatrix',np.eye(4)),('viewMatrix',view.T),('projectionMatrix',proj.T),('normalMatrix',view[:3,:3].T),('cameraPosition',eye),('fogColor',self.rgb('#8da5b5')),('fogNear',20),('fogFar',100)]:self.uniform(pr,n,a)
        for n,a in v.items():self.uniform(pr,n,self.rgb(a) if isinstance(a,str) else a)
        G.glEnable(0x0BE2);G.glBlendFunc(0x0302,0x0303);G.glDepthMask(False);self.draw_geometry(pr,self.grids[128 if v['uWaveDisplacement']>0 else 1]);G.glDepthMask(True);G.glFinish()
        image=np.empty((self.height,self.width,4),dtype=np.uint8);G.glReadPixels(0,0,self.width,self.height,0x1908,0x1401,image.ctypes.data)
        error=G.glGetError()
        if error:raise RuntimeError(f'GLES error: {error:#x}')
        return image[::-1,:,:3].copy()
if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('catalog', type=Path)
    parser.add_argument('--output', type=Path, default=Path('water-reference.png'))
    parser.add_argument('--preset', type=int, default=1)
    args = parser.parse_args()
    r = Renderer(args.catalog, Path(__file__).with_name('lab.js'))
    Image.fromarray(r.render(args.preset)).save(args.output)
    print(r.renderer, r.version, args.output)
