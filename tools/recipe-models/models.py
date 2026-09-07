"""Authored recipe prop designs. All dimensions in metres, Z up."""
import math
import numpy as np
from geometry import Model,rot,align_z,normalized
TAU=math.tau

def bolt(m,loc,r=.009,mat='bronze',direction=(0,0,1)):
    p=m.cylinder('fastener',mat,r,r*.7,(0,0,0),8,.001)
    m.transform(p,rotation=align_z(direction),offset=loc)

def log(m,center=(0,0,0),length=.8,radius=.055,angle=0,charred=False,seed=1):
    rng=np.random.default_rng(seed); before=len(m.parts)
    pts=[[length*i/5,math.sin(i*1.8)*radius*.12,0] for i in range(6)]
    rad=[radius*(1+rng.uniform(-.10,.08)) for _ in pts]
    m.tube('split timber / bark','charcoal' if charred else 'bark',pts,rad,14)
    for i,d in [(0,-1),(5,1)]:
        p=m.disk('cut end / growth rings','endgrain',rad[i]*.96,0,segments=20)
        m.transform(p,rotation=align_z([d,0,0]),offset=np.array(pts[i])+np.array([d*.0008,0,0]))
    # A branch scar changes the silhouette rather than painting every log alike.
    m.tube('branch scar','charcoal' if charred else 'bark',[[length*.65,0,0],[length*.69,radius*.6,radius*.8],[length*.71,radius*.8,radius*1.1]],[radius*.35,radius*.25,radius*.14],8)
    for p in m.parts[before:]:m.transform(p,rotation=rot('z',angle),offset=center)

def leaf(m,center,length,width,angle=0,tilt=0,mat='leaf',curl=.12):
    # Curved lanceolate silhouette with a raised central vein, no alpha cards.
    v=[[0,0,0]];uv=[[.5,0]]
    for q in (.28,.60,.83):
        w=math.sin(q*math.pi)*width*.5
        v.extend([[-w,length*q,curl*length*q*q],[0,length*q,curl*length*q*q+width*.12],[w,length*q,curl*length*q*q]])
        uv.extend([[0,q],[.5,q],[1,q]])
    v.append([0,length,curl*length]);uv.append([.5,1])
    f=[[0,2,1],[0,3,2],[1,2,4],[2,5,4],[2,3,5],[3,6,5],[4,5,7],[5,8,7],[5,6,8],[6,9,8],[7,8,10],[8,9,10]]
    p=m.add('individual curved leaf',mat,v,f,uv)
    m.transform(p,rotation=rot('z',angle)@rot('x',tilt),offset=center)

def roof(m,name,mat,width,depth,z,height):
    # Curved hipped eaves, not a pyramidal primitive.
    levels=[(1,0),(.93,.045),(.68,.10),(.38,.25),(.06,height)]
    v=[];uv=[];f=[]
    for scale,h in levels:
        for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]:v.append([x*width*.5*scale,y*depth*.5*scale,z+h]);uv.append([(x*scale+1)/2,(y*scale+1)/2])
    for k in range(len(levels)-1):
        for i in range(4):
            a=k*4+i;b=k*4+(i+1)%4;c=b+4;d=a+4;f.extend([[a,b,c],[a,c,d]])
    f.extend([[0,2,1],[0,3,2],[16,17,18],[16,18,19]])
    return m.add(name,mat,v,f,uv)

def torch():
    m=Model('torch')
    m.lathe('tapered ash handle','darkwood',[(0,0),(.033,0),(.037,.035),(.027,.8),(.042,.93),(.04,1.04),(0,1.04)],24)
    for z in [.13,.17,.78,.83]:m.torus('forged collar','iron',.033,.006,(0,0,z),24,6)
    m.lathe('burner cup','iron',[(.023,.89),(.052,.96),(.057,1.04),(.051,1.05),(.043,.974),(.018,.934)],24)
    m.cylinder('charred wick','charcoal',.04,.15,(0,0,1.08),18,.004)
    for i in range(3):m.torus('wire binding','bronze',.036,.0025,(0,0,.85+i*.02),24,5)
    return m

def bench():
    m=Model('bench')
    for i in range(5):m.box(f'seat board {i+1}','oak',(0,-.25+i*.12,.47),(1.64,.109,.045),.009)
    for i in range(3):m.box(f'backrest board {i+1}','oak',(0,.31+i*.03,.67+i*.14),(1.64,.047,.116),.008,rot('x',-.12))
    for x in [-.65,.65]:
        m.tube('cast iron front leg','iron',[[x,-.21,.47],[x,-.24,.28],[x,-.29,.035]],[.031,.027,.035],10)
        m.tube('cast iron rear leg and back support','iron',[[x,.30,.98],[x,.28,.60],[x,.22,.36],[x,.32,.035]],[.024,.026,.028,.035],10)
        m.tube('seat bearer','iron',[[x,-.29,.43],[x,.0,.43],[x,.32,.48]],.028,10)
        m.tube('swept armrest','iron',[[x,-.22,.48],[x,-.21,.63],[x,-.12,.68],[x,.19,.69],[x,.28,.77]],.021,10)
        m.box('foot flange front','iron',(x,-.29,.025),(.14,.10,.045),.008)
        m.box('foot flange rear','iron',(x,.32,.025),(.14,.10,.045),.008)
        for i in range(5):bolt(m,(x,-.25+i*.12,.495),.006)
        for i in range(3):bolt(m,(x,.282+i*.03,.67+i*.14),.007,direction=(0,-1,0))
    m.tube('lower stretcher','iron',[[-.65,.20,.24],[0,.20,.20],[.65,.20,.24]],.015,10)
    return m

def stone_lantern():
    m=Model('stone-lantern')
    m.box('dressed stone footing','limestone',(0,0,.065),(.52,.52,.13),.026)
    m.box('footing upper step','limestone',(0,0,.145),(.4,.4,.045),.012)
    m.lathe('tapered carved pedestal','limestone',[(0,.165),(.155,.165),(.175,.21),(.12,.26),(.105,.77),(.155,.82),(.17,.84),(.16,.88),(0,.88)],16)
    m.box('firebox shelf','limestone',(0,0,.87),(.44,.44,.085),.017)
    for x in [-.155,.155]:
        for y in [-.155,.155]:m.box('open firebox corner','limestone',(x,y,1.055),(.065,.065,.31),.008)
    m.box('firebox lintel','limestone',(0,0,1.22),(.40,.40,.07),.015)
    m.cylinder('inner lamp','warm-light',.065,.12,(0,0,1.035),16,.015)
    m.cylinder('lamp tray','bronze',.085,.018,(0,0,.965),20,.002)
    roof(m,'swept stone roof','limestone',.72,.72,1.25,.16)
    m.lathe('carved finial','limestone',[(0,1.405),(.075,1.405),(.052,1.45),(.057,1.475),(.036,1.51),(0,1.55)],24)
    return m

def street_light():
    m=Model('street-light')
    m.lathe('cast iron stepped pole','iron',[(0,0),(.17,0),(.17,.08),(.12,.13),(.11,.29),(.075,.36),(.045,.45),(.042,2.62),(.11,2.7),(.17,2.72),(.17,2.75),(0,2.75)],24)
    m.lathe('collar mouldings','bronze',[(.046,.43),(.058,.43),(.06,.46),(.048,.48)],24)
    for x in [-.13,.13]:
        for y in [-.13,.13]:m.tube('lamp frame','iron',[[x*.75,y*.75,2.74],[x,y,3.04]],.012,8)
    m.box('diffusing lamp glass','paper',(0,0,2.88),(.20,.20,.24),.01)
    roof(m,'weather canopy','iron',.62,.62,3.05,.19)
    m.lathe('canopy finial','bronze',[(0,3.23),(.033,3.23),(.045,3.28),(.025,3.30),(0,3.34)],16)
    for a in range(4):bolt(m,(math.cos(a*math.pi/2)*.125,math.sin(a*math.pi/2)*.125,.085),.012)
    return m

def rock_model(name,seed):
    m=Model(name)
    p=m.ellipsoid('weathered rock','basalt',(0,0,.31),(.76,.72,.66),seed,.38,20,12)
    # Keep the closed underside: flattening every low latitude produced
    # overlapping coplanar rings and inverted smooth normals.
    p.normals=None
    return m

def brazier():
    m=Model('brazier')
    m.lathe('forged fire bowl','iron',[(.09,.44),(.13,.45),(.21,.56),(.24,.68),(.235,.705),(.215,.704),(.19,.575),(.11,.48),(.09,.48)],32)
    m.torus('rolled rim','bronze',.234,.009,(0,0,.696),40,6)
    for a in [0,TAU/3,2*TAU/3]:
        u=np.array([math.cos(a),math.sin(a),0])
        m.tube('splayed leg','iron',[u*.205+[0,0,.025],u*.13+[0,0,.39],u*.16+[0,0,.54]],[.018,.021,.016],10)
        bolt(m,u*.205+[0,0,.58],.008,direction=u)
    for i in range(7):m.ellipsoid('charcoal bed','charcoal',(.11*math.cos(i*2.4),.10*math.sin(i*2.4),.64),(.12,.10,.075),i,.25,12,6)
    return m

def lantern():
    m=Model('lantern')
    m.lathe('ribbed washi shade','paper',[(0,.035),(.055,.035),(.105,.07),(.128,.14),(.12,.22),(.087,.29),(.051,.305),(0,.305)],32)
    for i in range(10):
        z=.057+i*.025;r=.057+.069*math.sin((z-.03)/.285*math.pi)
        m.torus('bamboo shade rib','darkwood',r,.0018,(0,0,z),32,5)
    for z in [.026,.312]:m.cylinder('blackened end ring','iron',.056,.022,(0,0,z),24,.003)
    m.torus('hanging loop','iron',.024,.003,(0,0,.346),20,5,rot('x',math.pi/2))
    return m

def candelabra():
    m=Model('candelabra')
    m.lathe('turned bronze stem','bronze',[(0,0),(.125,0),(.13,.016),(.115,.028),(.07,.04),(.034,.08),(.024,.20),(.03,.26),(.022,.34),(.046,.35),(.046,.365),(0,.365)],24)
    for sign in [-1,1]:m.tube('curled arm','bronze',[[0,0,.23],[sign*.08,0,.21],[sign*.135,0,.24],[sign*.14,0,.30],[sign*.14,0,.35]],[.013]*5,10)
    for x in [-.14,0,.14]:
        z=.37 if x else .4
        m.lathe('candle drip tray','bronze',[(0,z-.025),(.04,z-.025),(.045,z-.012),(.044,z),(.037,z-.003),(0,z-.006)],20,(x,0,0))
        m.cylinder('beeswax candle','wax',.020,.16,(x,0,z+.075),20,.004)
        for i in range(3):m.tube('wax drip','wax',[[x+.019*math.cos(i*2),.019*math.sin(i*2),z+.145],[x+.021*math.cos(i*2),.021*math.sin(i*2),z+.11-i*.01]],.0035,6)
        m.tube('wick','charcoal',[[x,0,z+.152],[x+.002,0,z+.17]],.002,5)
    return m

def bamboo():
    m=Model('bamboo-stalk')
    for i in range(8):
        r=.044-i*.0022
        m.lathe('bamboo internode','bamboo',[(r*.92,i*.39),(r,i*.39+.025),(r*.90,i*.39+.35),(r*.94,i*.39+.39)],18)
        m.torus('raised node','darkwood',r,.003,(0,0,i*.39+.018),20,5)
    rng=np.random.default_rng(17)
    for i in range(6):
        a=i*2.4;z=1.4+i*.28;end=np.array([math.cos(a)*.33,math.sin(a)*.33,z+.22])
        m.tube('bamboo branch','bamboo',[[0,0,z],end*.5+[0,0,z*.5],end],[.009,.006,.001],6)
        for k in range(7):
            p=end+np.array([rng.uniform(-.11,.11),rng.uniform(-.11,.11),rng.uniform(-.12,.12)])
            leaf(m,p,.20,.032,a+k*.6,rng.uniform(-1.2,-.5),'leaf-light')
    return m

def stump():
    m=Model('stump');vv=[];uv=[];f=[];s=40
    profiles=[(.38,0),(.30,.05),(.22,.16),(.205,.38),(.193,.41)]
    for j,(r,z) in enumerate(profiles):
        for i in range(s+1):
            a=i/s*TAU;rr=r*(1+.13*math.sin(5*a+.2)*(1-j/6)+.04*math.sin(11*a));vv.append([rr*math.cos(a),rr*math.sin(a),z+.004*math.sin(a*3)]);uv.append([i/s,j/4])
    for j in range(4):
        for i in range(s):
            a=j*(s+1)+i;b=a+s+1;f.extend([[a,a+1,b],[a+1,b+1,b]])
    m.add('flared trunk and root buttresses','bark',vv,f,uv)
    m.disk('cut growth rings','endgrain',.194,.41,segments=40)
    for i in range(5):
        a=i*TAU/5;m.tube('root bark','bark',[[.12*math.cos(a),.12*math.sin(a),.24],[.27*math.cos(a),.27*math.sin(a),.07],[.43*math.cos(a),.43*math.sin(a),.025]],[.06,.044,.009],8)
    return m

def single_log():
    m=Model('log');log(m,seed=5);return m

def bush():
    m=Model('bush');rng=np.random.default_rng(27)
    for i in range(11):
        a=i*2.4;end=np.array([.29*math.cos(a),.24*math.sin(a),.15+rng.random()*.20])
        m.tube('woody branch','bark',[[0,0,.015],end*.55,end],[.01,.005,.001],6)
        for k in range(13):
            c=end+np.array([rng.normal(0,.09),rng.normal(0,.09),rng.normal(0,.065)])
            c[2]=max(c[2],.06);leaf(m,c,.10+rng.random()*.07,.06+rng.random()*.025,rng.random()*TAU,rng.uniform(-1.1,.8),'leaf-light' if k%4==0 else 'leaf')
    return m

def tree():
    m=Model('tree');rng=np.random.default_rng(36)
    trunk=[[0,0,0],[.018,-.014,.35],[.01,0,.92],[-.06,.02,1.4],[.0,.02,1.85],[.13,.02,2.3],[.14,.05,2.75]]
    m.tube('tapered trunk','bark',trunk,[.115,.085,.068,.052,.035,.016,.002],14)
    for i in range(5):
        a=i*TAU/5;m.tube('root flare','bark',[[math.cos(a)*.23,math.sin(a)*.23,.015],[math.cos(a)*.085,math.sin(a)*.085,.10],[0,0,.32]],[.025,.04,.052],8)
    for i in range(17):
        a=i*2.4;z=1.12+(i%6)*.24;rad=.56 if z<2 else .40
        base=np.array([-.03,0,z]);tip=np.array([math.cos(a)*rad,math.sin(a)*rad,z+.44]);mid=base*.35+tip*.65-[0,0,.13]
        m.tube('primary branch','bark',[base,mid,tip],[.026,.014,.003],8)
        for k in range(3):
            sub=tip+np.array([math.cos(a+k*2)*.22,math.sin(a+k*2)*.22,.09+k*.07]);m.tube('fine twig','bark',[mid,sub],[.008,.0012],6)
            for j in range(12):
                p=sub+np.array([rng.normal(0,.115),rng.normal(0,.105),rng.normal(0,.10)])
                leaf(m,p,.17+rng.random()*.07,.10+rng.random()*.035,rng.random()*TAU,rng.uniform(-1.25,1.2),'leaf-light' if j%5==0 else 'leaf')
    return m

def pillar():
    m=Model('pillar')
    m.box('plinth','limestone',(0,0,.075),(.60,.60,.15),.025)
    m.box('plinth upper step','limestone',(0,0,.19),(.47,.47,.08),.015)
    m.lathe('base moulding','limestone',[(.16,.23),(.22,.23),(.24,.26),(.22,.29),(.17,.33)],40)
    vv=[];uv=[];f=[];s=64
    for j,z in enumerate([.31,.36,2.64,2.69]):
        r=[.175,.168,.132,.139][j]
        for i in range(s+1):
            a=i/s*TAU;rr=r-(.013 if j in (1,2) else .004)*(1+math.cos(16*a))*.5
            vv.append([rr*math.cos(a),rr*math.sin(a),z]);uv.append([i/s*2,z/3])
    for j in range(3):
        for i in range(s):
            a=j*(s+1)+i;b=a+s+1;f.extend([[a,a+1,b],[a+1,b+1,b]])
    m.add('fluted stone shaft','limestone',vv,f,uv)
    m.lathe('capital moulding','limestone',[(.14,2.67),(.17,2.73),(.23,2.77),(.25,2.86),(.24,2.91)],40)
    m.box('capital abacus','limestone',(0,0,2.995),(.61,.61,.17),.02)
    return m

def stairs():
    m=Model('stairs')
    for i in range(5):
        height=.18*(i+1);y=i*.39
        m.box('solid stair tread','limestone',(0,y,height/2),(1.60,.40,height),.007)
        m.box('darker stone nosing','basalt',(0,y-.185,height-.012),(1.58,.037,.024),.004)
        # Two thin slip-resistant grooves rather than dense tile geometry.
        for k in range(2):m.box('anti-slip inset','basalt',(0,y-.11+k*.04,height+.0005),(1.39,.008,.001),.0002)
    return m

def wall():
    m=Model('wall')
    for x in [-2.6,0,2.6]:
        m.box('masonry pier','limestone',(x,0,1.02),(.28,.45,2.04),.016)
        m.box('pier cap','basalt',(x,0,2.075),(.44,.58,.10),.022)
        for z in [.26,.61,1.0,1.39,1.77]:m.box('pier joint','basalt',(x,-.227,z),(.27,.0015,.006),.0003)
    for x in [-1.3,1.3]:
        m.box('rendered wall infill','ivory',(x,0,1.10),(2.31,.20,1.63),.008)
        m.box('wall footing','basalt',(x,0,.15),(2.31,.30,.30),.012)
        m.box('sloped stone coping','limestone',(x,0,1.965),(2.42,.35,.115),.018)
        for i in range(8):m.box('coping joint','basalt',(x-1.05+i*.3,0,2.024),(.008,.32,.001),.0002)
    return m

def well_frame():
    m=Model('well-frame')
    for x in [-.62,.62]:
        m.box('stone post foot','basalt',(x,0,.065),(.25,.25,.13),.012)
        m.box('oak upright','oak',(x,0,1.03),(.125,.125,1.96),.008)
        for y in [-.045,.045]:bolt(m,(x,y,.4),.012,direction=(0,-1,0))
        m.tube('knee brace','darkwood',[[x,0,1.5],[x*.55,0,1.96]],.038,4)
    m.tube('winch spindle','darkwood',[[-.77,0,1.30],[.77,0,1.30]],.035,16)
    for x in [-.09,.09]:
        p=m.cylinder('rope drum flange','iron',.09,.014,segments=24);m.transform(p,rotation=rot('y',math.pi/2),offset=(x,0,1.30))
    for i in range(10):
        p=m.torus('coiled rope','oak',.055,.006,major_seg=24,minor_seg=5);m.transform(p,rotation=rot('y',math.pi/2),offset=(-.072+i*.016,0,1.30))
    m.tube('hanging rope','oak',[[0,-.048,1.30],[0,-.048,.65]],.008,6)
    m.tube('crank','iron',[[.77,0,1.30],[.80,0,1.30],[.80,0,1.16],[.89,0,1.16]],.012,8)
    for side in [-1,1]:
        for i in range(9):
            x=-.72+i*.18
            m.box('roof plank','darkwood',(x,side*.25,2.015),( .174,.59,.035),.004,rot('x',-side*.50))
        m.tube('eaves fascia','oak',[[-.8,side*.51,1.85],[.8,side*.51,1.85]],.033,4)
    m.box('ridge cap','oak',(0,0,2.175),(1.67,.12,.085),.014)
    return m

def pier():
    m=Model('pier')
    for x in [-.52,.52]:
        m.box('longitudinal beam','darkwood',(x,1.0,.29),(.14,2.4,.18),.010)
        for y in [.03,1.0,2.0]:
            m.cylinder('timber piling','bark',.067,.51,(x,y,.255),16,.006)
            m.disk('piling endgrain','endgrain',.064,.512,(x,y),16)
    for i in range(14):
        y=-.12+i*.176
        m.box('deck board','oak',(0,y,.43),(1.37,.164,.055),.006)
        for x in [-.51,.51]:bolt(m,(x,y,.46),.007,'iron')
    return m

def table():
    m=Model('table')
    for i in range(5):m.box('oak tabletop board','oak',(0,-.32+i*.16,.745),(1.40,.153,.05),.006)
    for x in [-.57,.57]:
        for y in [-.28,.28]:m.tube('tapered solid leg','oak',[[x,y,.705],[x*1.03,y*1.05,.035]],[.048,.030],4)
    for y in [-.29,.29]:m.box('long apron','darkwood',(0,y,.66),(1.18,.035,.12),.005)
    for x in [-.57,.57]:m.box('end apron','darkwood',(x,0,.66),(.035,.56,.12),.005)
    for x in [-.56,.56]:
        for y in [-.30,.30]:bolt(m,(x,y,.772),.006,'iron')
    return m

def stool():
    m=Model('stool')
    m.lathe('rounded solid oak seat','oak',[(0,.385),(.17,.385),(.196,.397),(.2,.42),(.192,.44),(.15,.442),(0,.437)],40)
    for a in np.arange(4)*TAU/4+math.pi/4:
        tip=np.array([math.cos(a)*.16,math.sin(a)*.16,.017]);top=np.array([math.cos(a)*.12,math.sin(a)*.12,.396]);m.tube('splayed turned leg','darkwood',[tip,top*.70+tip*.30,top],[.018,.024,.020],12)
    for a in np.arange(4)*TAU/4+math.pi/4:
        b=a+math.pi/2;m.tube('leg stretcher','oak',[[math.cos(a)*.14,math.sin(a)*.14,.16],[math.cos(b)*.14,math.sin(b)*.14,.16]],.010,8)
    return m

def magic_circle():
    m=Model('magic-circle')
    m.cylinder('engraved obsidian disk','basalt',.75,.045,(0,0,.0225),64,.007)
    for r in [.70,.59,.30]:m.torus('bronze circular inlay','bronze',r,.003,(0,0,.049),64,5)
    for r in [.65,.35]:m.torus('luminous circular inscription','aqua-light',r,.0018,(0,0,.050),64,5)
    for i in range(12):
        a=i*TAU/12;c=np.array([math.cos(a)*.49,math.sin(a)*.49,.05]);R=rot('z',a-math.pi/2)
        for pts in [[[0,-.04,0],[0,.043,0]],[[-.02,.015,0],[0,.043,0],[.023,.016,0]],[[-.017,-.020,0],[.017,-.005,0]]]:m.tube('inlaid glyph','bronze',np.array(pts)@R.T+c,.002,5)
    for i in range(6):
        a=i*TAU/6;b=a+TAU/3;m.tube('inner geometric inscription','aqua-light',[[math.cos(a)*.29,math.sin(a)*.29,.051],[math.cos(b)*.29,math.sin(b)*.29,.051]],.002,5)
    return m

def warp_pillar():
    m=Model('warp-pillar')
    m.lathe('hexagonal base','basalt',[(0,0),(.34,0),(.34,.12),(.28,.18),(.25,.27),(0,.27)],6,phase=math.pi/6)
    m.lathe('faceted monolith','basalt',[(0,.23),(.22,.23),(.205,.36),(.16,2.75),(.20,2.90),(.10,3.07),(0,3.15)],6,phase=math.pi/6)
    for a in np.arange(6)*TAU/6:
        n=np.array([math.cos(a),math.sin(a),0]);p1=n*.188+[0,0,.43];p2=n*.148+[0,0,2.71]
        m.tube('recessed luminous channel','aqua-light',[p1,p2],.008,6)
    for z,r in [(.29,.218),(2.78,.18)]:m.torus('metal collar','bronze',r,.012,(0,0,z),6,6)
    return m

def snowman():
    m=Model('snowman')
    m.ellipsoid('snow body','snow',(0,0,.39),(.80,.75,.79),6,.025,24,12)
    m.ellipsoid('snow head','snow',(0,0,.94),(.51,.49,.52),7,.025,24,12)
    for x in [-.085,.085]:m.ellipsoid('coal eye','black',(x,-.232,1.02),(.028,.022,.028),1,.15,10,6)
    m.tube('carrot nose','orange',[[0,-.242,.95],[.016,-.45,.93]],[.039,.004],14)
    for i in range(5):
        a=math.pi+i*math.pi/4;m.ellipsoid('coal smile','black',(.10*math.cos(a),-.236,.91+.06*math.sin(a)),(.020,.018,.019),i,.1,8,5)
    for z in [.28,.44,.58]:m.ellipsoid('coal button','black',(0,-.365,z),(.029,.023,.033),1,.1,8,5)
    m.cylinder('felt hat brim','black',.295,.023,(0,0,1.18),32,.008)
    m.cylinder('felt hat crown','black',.195,.23,(0,0,1.30),32,.018)
    m.lathe('hat band','scarlet',[(.196,1.195),(.196,1.24)],32)
    m.torus('knitted scarf','scarlet',.228,.033,(0,0,.76),32,8)
    m.box('hanging scarf end','scarlet',(-.13,-.27,.63),(.10,.028,.30),.008,rot('x',-.16))
    for i in [-1,1]:
        m.tube('twig arm','bark',[[i*.29,0,.61],[i*.47,-.03,.69],[i*.63,-.02,.88]],[.021,.013,.005],7)
        m.tube('twig fingers','bark',[[i*.49,-.03,.72],[i*.62,-.02,.73]],[.009,.002],6)
    return m

def door():
    m=Model('door')
    for x in [-.49,.49]:m.box('solid frame jamb','darkwood',(x,0,1.045),(.10,.12,2.09),.006)
    m.box('frame head','darkwood',(0,0,2.045),(1.08,.12,.09),.006)
    m.box('door leaf','oak',(0,0,.985),(.884,.046,1.95),.006)
    for z,h in [(.55,.67),(1.40,.70)]:
        m.box('recessed panel','darkwood',(0,-.027,z),(.65,.008,h),.008)
        for x in [-.34,.34]:m.box('panel stile moulding','oak',(x,-.036,z),(.027,.023,h+.04),.004)
        for zz in [z-h/2,z+h/2]:m.box('panel rail moulding','oak',(0,-.036,zz),(.69,.023,.029),.004)
    for z in [.27,.99,1.73]:
        m.box('hinge leaf','iron',(-.448,-.035,z),(.04,.012,.09),.002)
        p=m.cylinder('hinge knuckle','iron',.009,.102,segments=12);m.transform(p,offset=(-.468,-.035,z))
    m.box('handle backplate','bronze',(.337,-.033,1.01),(.044,.015,.14),.005)
    m.tube('handle spindle','bronze',[[.337,-.035,1.025],[.337,-.085,1.025]],.012,12)
    m.tube('lever handle','bronze',[[.337,-.085,1.025],[.253,-.085,1.025]],.012,12)
    return m

def window():
    m=Model('window')
    for x in [-.535,.535]:m.box('window jamb','oak',(x,0,.68),(.09,.13,1.36),.005)
    for z in [.04,1.32]:m.box('window head and sill','oak',(0,0,z),(1.16,.15,.08),.005)
    m.box('projecting sill','limestone',(0,-.04,.014),(1.20,.23,.029),.006)
    for x in [-.258,.258]:
        for z in [.35,.97]:
            m.box('glass pane','window-glass',(x,0,z),(.49,.006,.58),.0005)
    m.box('vertical mullion','darkwood',(0,-.01,.67),(.034,.09,1.25),.003)
    m.box('horizontal sash rail','darkwood',(0,-.025,.66),(1.0,.09,.038),.003)
    for x in [-.035,.035]:bolt(m,(x,-.075,.655),.008,direction=(0,-1,0))
    return m

def floor_panel():
    m=Model('floor-panel')
    m.box('structural base','darkwood',(0,0,-.036),(2,2,.028),.001)
    for i in range(10):
        x=-.9+i*.2
        for j in range(2):m.box('oak plank','oak',(x,-.5+j, -.011),(.194,.994,.024),.0018)
    return m

def wall_panel():
    m=Model('wall-panel')
    m.box('plaster backing','ivory',(0,0,1.2),(2,.12,2.4),.004)
    m.box('skirting','darkwood',(0,-.066,.07),(2,.035,.14),.004)
    m.box('upper moulding','oak',(0,-.07,2.37),(2,.04,.06),.004)
    for x in [-.965,0,.965]:m.box('timber batten','oak',(x,-.07,1.25),(.05,.033,2.28),.004)
    return m

def campfire():
    m=Model('campfire-base');rng=np.random.default_rng(170)
    m.cylinder('ash bed','ash',.38,.018,(0,0,.009),40,.005)
    for i in range(11):
        a=TAU*i/11;r=.48+rng.uniform(-.017,.017)
        p=m.ellipsoid('irregular hearth stone','basalt',(r*math.cos(a),r*math.sin(a),.08),(.245,.17,.16),i+90,.34,16,8)
        # Rotate each stone long axis tangentially.
        c=np.array([r*math.cos(a),r*math.sin(a),.08]);p.vertices=(p.vertices-c)@rot('z',a+math.pi/2).T+c;p.normals=None
    for i,(a,z) in enumerate([(0,.083),(.48,.10),(2.0,.12),(-.8,.16),(1.30,.20)]):
        center=np.array([-.30*math.cos(a),-.30*math.sin(a),z]);log(m,center,.58,.054,a,True,i+19)
    for i in range(20):
        a=rng.random()*TAU;r=rng.uniform(.04,.28)
        m.ellipsoid('ember fragment','ember' if i%3==0 else 'charcoal',(math.cos(a)*r,math.sin(a)*r,.055+rng.uniform(0,.025)),(.027,.018,.013),i,.32,8,4)
    return m

def fountain():
    m=Model('fountain')
    m.lathe('bevelled plinth','limestone',[(0,0),(1.03,0),(1.08,.04),(1.08,.09),(1.03,.14),(.98,.16),(0,.16)],48)
    # A watertight masonry basin; inner surface is genuinely hollow.
    m.lathe('hollow stone basin','limestone',[(.90,.12),(.96,.13),(.99,.25),(1.015,.36),(1.015,.40),(.99,.435),(.925,.435),(.90,.405),(.91,.365),(.875,.22),(.82,.18),(.18,.18),(.18,.12)],48)
    m.torus('dark rim bead','basalt',.967,.009,(0,0,.438),48,6)
    m.disk('lower basin water','water',.902,.313,segments=64)
    m.lathe('turned stone pedestal','limestone',[(0,.17),(.21,.17),(.23,.21),(.19,.28),(.135,.34),(.11,.68),(.17,.75),(.24,.78),(.27,.80),(0,.80)],32)
    m.lathe('upper catch bowl','limestone',[(.12,.70),(.19,.72),(.32,.80),(.39,.90),(.40,.96),(.385,.98),(.35,.98),(.34,.94),(.32,.86),(.22,.81),(.12,.80),(.12,.70)],40)
    m.disk('upper water surface','water',.349,.937,segments=48)
    m.lathe('bronze jet nozzle','bronze',[(0,.94),(.028,.94),(.028,1.015),(.016,1.05),(.010,1.05),(.010,1.00),(0,1.00)],20)
    # Six continuous spill streams. These are static GLB surfaces, not a fluid sim.
    for i in range(6):
        a=i*TAU/6;pts=[];rs=[]
        for k in range(11):
            t=k/10;r=.365+.285*t;z=.967-.64*t*t
            pts.append([math.cos(a)*r,math.sin(a)*r,z]);rs.append(.013*(1-.35*t))
        m.tube('spill stream / static surface','water',pts,rs,6)
        m.torus('splash ring / static surface','water',.07,.003,(math.cos(a)*.65,math.sin(a)*.65,.315),20,5)
    # Restrained joints, engraved into the visual vocabulary without dense tiles.
    for i in range(16):
        a=i*TAU/16
        m.tube('rim joint','basalt',[[.93*math.cos(a),.93*math.sin(a),.437],[1.00*math.cos(a),1.00*math.sin(a),.432]],.0015,4)
    return m

def well_basin():
    m=Model('well-basin')
    m.lathe('well lining','basalt',[(.43,0),(.66,0),(.66,.05),(.61,.08),(.61,.57),(.66,.61),(.65,.68),(.44,.68),(.43,.64),(.44,.1),(.43,0)],48)
    for tier in range(3):
        for i in range(12):
            a=i*TAU/12+(tier%2)*TAU/24
            z=.08+tier*.177
            # Individual wedge blocks with visible mortar gaps; no rock pile.
            m.lathe('coursed stone block','limestone',[(.455,z),(.62,z),(.626,z+.012),(.626,z+.154),(.614,z+.166),(.455,z+.166),(.455,z)],5,arc=TAU/12-.025,phase=a)
    m.disk('water in well','water',.435,.12,segments=48)
    return m

BUILDERS={
    'torch':torch,'bench':bench,'stone-lantern':stone_lantern,'tree':tree,
    'street-light':street_light,'rock-a':lambda:rock_model('rock-a',4),'rock-b':lambda:rock_model('rock-b',9),
    'brazier':brazier,'lantern':lantern,'candelabra':candelabra,'bamboo-stalk':bamboo,
    'stump':stump,'log':single_log,'bush':bush,'pillar':pillar,'stairs':stairs,'wall':wall,
    'well-frame':well_frame,'pier':pier,'table':table,'stool':stool,'magic-circle':magic_circle,
    'warp-pillar':warp_pillar,'snowman':snowman,'door':door,'window':window,
    'floor-panel':floor_panel,'wall-panel':wall_panel,'campfire-base':campfire,
    'fountain':fountain,'well-basin':well_basin,
}
