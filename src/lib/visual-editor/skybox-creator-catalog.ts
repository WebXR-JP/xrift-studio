// Original Skybox Creator palette shader, adapted to the native linear-light contract.
// The same authored surface is installed, previewed and compiled for World output.
import type {SkyShaderCatalogEntry} from './sky-shader-catalog';
import type {ClassicR3fMaterialShader} from './custom-shader-contract';
import {SKY_VERTEX_SHADER} from './sky-shader-glsl';
const fragmentShader="\nprecision highp float;\nvarying vec3 vDirection;\nuniform float uRotation,uExposure;\nuniform vec3 uZenith,uUpper,uHorizon,uGround,uCloudLight,uCloudShadow,uCloudRim,uSunColor,uGlowColor;\nuniform float uHaze,uGradient,uPaletteExposureEV,uCloudAmount,uCloudScale,uCloudSoftness,uCloudHeight,uCloudRimStrength;\nuniform float uSunAltitude,uSunAzimuth,uSunSize,uSunIntensity,uGlow,uStars,uStarBrightness,uSeed;\n\nconst float PI=3.14159265359;\nfloat hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}\nfloat hash3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453123);}\nfloat noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}\nfloat fbm(vec2 p){float v=0.,a=.52;for(int i=0;i<5;i++){v+=noise(p)*a;p=mat2(1.63,-1.21,1.21,1.63)*p+vec2(2.1,1.3);a*=.48;}return v;}\nvec3 paletteColor(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));}\nvec3 paletteLinear(vec3 c){return mix(c/12.92,pow((max(c,vec3(0.))+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}\nvoid main(){\n vec3 direction=normalize(vDirection);float c=cos(uRotation),s=sin(uRotation);\n vec3 r=vec3(direction.x*c+direction.z*s,direction.y,-direction.x*s+direction.z*c);\n float h=max(r.y,0.);\n float spread=mix(.22,.88,uGradient);\n vec3 col=mix(paletteColor(uHorizon),paletteColor(uUpper),smoothstep(0.,spread,h));\n col=mix(col,paletteColor(uZenith),smoothstep(spread*.34,1.,h));\n vec3 sun=normalize(vec3(sin(uSunAzimuth)*cos(uSunAltitude),sin(uSunAltitude),cos(uSunAzimuth)*cos(uSunAltitude)));\n float dp=clamp(dot(r,sun),-1.,1.);float angularDistance=max(0.,2.*(1.-dp));\n float sunVisible=smoothstep(-.27,.02,uSunAltitude);\n float sunsetDirection=pow(max(dp,0.),4.);\n float horizonHaze=exp(-h*mix(25.,4.,uHaze));\n col=mix(col,paletteColor(uHorizon),horizonHaze*uHaze*.35);\n float glowShape=exp(-angularDistance/mix(.008,.48,uGlow));\n col=mix(col,paletteColor(uGlowColor),glowShape*uGlow*.48*sunVisible);\n // Low sun scatters warm light beneath cooler upper air.\n float dusk=exp(-abs(uSunAltitude-.035)*5.5)*uGlow*sunVisible;\n col=mix(col,paletteColor(uGlowColor),exp(-pow((h-.065)*5.,2.))*sunsetDirection*dusk*.14);\n float disk=smoothstep(cos(uSunSize),cos(uSunSize*.88),dp);\n float visibleAboveHorizon=smoothstep(-.005,.007,r.y);\n float solar=disk*min(1.,uSunIntensity)*visibleAboveHorizon;\n col=mix(col,paletteColor(uSunColor),solar);\n col+=paletteColor(uSunColor)*disk*max(0.,uSunIntensity-1.)*.13;\n col+=paletteColor(uGlowColor)*exp(-angularDistance/max(.00001,uSunSize*uSunSize*6.))*uGlow*.12*min(uSunIntensity,1.5)*visibleAboveHorizon;\n float starFade=smoothstep(-.02,.28,r.y);\n vec3 grid=r*550.;vec3 cell=floor(grid);vec3 local=fract(grid)-.5;\n float starSeed=hash3(cell+uSeed*.01);\n float starPoint=1.-smoothstep(.08,.45,length(local));\n float starMask=step(1.-uStars*.012,starSeed)*starPoint*starFade;\n col+=mix(vec3(.72,.81,1.),vec3(1.,.90,.76),hash3(cell+9.))*starMask*uStarBrightness*1.15;\n // A horizontal cloud layer sampled by a world-space ray: continuous at the panorama seam.\n float cloudElevation=mix(.035,.28,uCloudHeight);\n float scale=mix(5.8,1.1,uCloudScale);\n vec2 p=r.xz/max(.045,r.y)*scale*mix(.65,1.25,uCloudHeight)+vec2(uSeed*.071,uSeed*.137);\n float n=fbm(p);\n float detail=noise(p*6.1+4.3);\n n=mix(n,n*.87+detail*.13,.7);\n float threshold=mix(.79,.27,uCloudAmount);\n float soft=mix(.035,.22,uCloudSoftness);\n float cloud=smoothstep(threshold,threshold+soft,n);\n cloud*=smoothstep(cloudElevation*.25,cloudElevation+.08,r.y)*min(1.,uCloudAmount*15.);\n vec2 lightDirection=vec2(sin(uSunAzimuth),cos(uSunAzimuth));\n float slope=fbm(p+lightDirection*.14)-n;\n float lightness=clamp(.53+slope*3.7+max(uSunAltitude,0.)*.12,0.,1.);\n float underside=smoothstep(threshold+.04,threshold+.3,n);\n lightness=mix(lightness,lightness*.69,underside*.5);\n vec3 cloudColor=mix(paletteColor(uCloudShadow),paletteColor(uCloudLight),lightness);\n float edge=(1.-smoothstep(threshold+.025,threshold+.16,n))*cloud;\n float rim=edge*uCloudRimStrength*(.25+sunsetDirection*.75)*sunVisible;\n cloudColor=mix(cloudColor,paletteColor(uCloudRim),rim*.95);\n cloudColor+=paletteColor(uCloudRim)*rim*dusk*.11;\n cloudColor=mix(paletteColor(uHorizon),cloudColor,smoothstep(0.,.35,r.y)*.76+.24);\n col=mix(col,cloudColor,cloud*.96);\n float below=1.-smoothstep(-.025,.006,r.y);\n vec3 lower=mix(paletteColor(uGround),paletteColor(uHorizon),exp(min(r.y,0.)*mix(16.,5.,uHaze)));\n col=mix(col,lower,below);\n // Display-referred exposure keeps the chosen palette stable at 0 EV.\n col=clamp(col,0.,1.);\n if(uPaletteExposureEV>=0.) col=1.-pow(max(vec3(.00001),1.-col),vec3(pow(2.,uPaletteExposureEV)));\n else col=pow(col,vec3(pow(2.,-uPaletteExposureEV)));\n gl_FragColor=vec4(paletteLinear(clamp(col,0.,1.))*uExposure,1.);\n #include <tonemapping_fragment>\n #include <colorspace_fragment>\n}";
const parameters=[
  {
    "uniform": "uZenith",
    "label": "天頂の色",
    "hint": "空の配色を変更します。",
    "kind": "color"
  },
  {
    "uniform": "uUpper",
    "label": "空の中間色",
    "hint": "空の配色を変更します。",
    "kind": "color"
  },
  {
    "uniform": "uHorizon",
    "label": "地平線の色",
    "hint": "空の配色を変更します。",
    "kind": "color"
  },
  {
    "uniform": "uGround",
    "label": "下半球の色",
    "hint": "空の配色を変更します。",
    "kind": "color"
  },
  {
    "uniform": "uCloudLight",
    "label": "光を受ける面",
    "hint": "空の配色を変更します。",
    "kind": "color"
  },
  {
    "uniform": "uCloudShadow",
    "label": "雲の影",
    "hint": "空の配色を変更します。",
    "kind": "color"
  },
  {
    "uniform": "uCloudRim",
    "label": "光のふち",
    "hint": "空の配色を変更します。",
    "kind": "color"
  },
  {
    "uniform": "uSunColor",
    "label": "太陽の色",
    "hint": "空の配色を変更します。",
    "kind": "color"
  },
  {
    "uniform": "uGlowColor",
    "label": "にじむ光",
    "hint": "空の配色を変更します。",
    "kind": "color"
  },
  {
    "uniform": "uCloudAmount",
    "label": "雲の量",
    "hint": "大きいほど強くなります。",
    "kind": "number",
    "min": 0,
    "max": 1,
    "step": 0.01
  },
  {
    "uniform": "uCloudScale",
    "label": "雲の大きさ",
    "hint": "大きいほど強くなります。",
    "kind": "number",
    "min": 0.1,
    "max": 1,
    "step": 0.01
  },
  {
    "uniform": "uCloudSoftness",
    "label": "輪郭の柔らかさ",
    "hint": "大きいほど強くなります。",
    "kind": "number",
    "min": 0,
    "max": 1,
    "step": 0.01
  },
  {
    "uniform": "uCloudRimStrength",
    "label": "ふちに当たる光",
    "hint": "大きいほど強くなります。",
    "kind": "number",
    "min": 0,
    "max": 1,
    "step": 0.01
  },
  {
    "uniform": "uGlow",
    "label": "光のにじみ",
    "hint": "大きいほど強くなります。",
    "kind": "number",
    "min": 0,
    "max": 1,
    "step": 0.01
  },
  {
    "uniform": "uStars",
    "label": "星の量",
    "hint": "大きいほど強くなります。",
    "kind": "number",
    "min": 0,
    "max": 1,
    "step": 0.01
  },
  {
    "uniform": "uStarBrightness",
    "label": "星の明るさ",
    "hint": "大きいほど強くなります。",
    "kind": "number",
    "min": 0,
    "max": 1,
    "step": 0.01
  }
] as const;
const entries:Array<Omit<SkyShaderCatalogEntry,"parameters"|"shader"> & {uniforms:ClassicR3fMaterialShader["uniforms"]}>=[
  {
    "id": "creator-dawn",
    "label": "夜明けの余韻 · Skybox Creator",
    "category": "dawn",
    "description": "夜明けの余韻の空。雲の形を揃えた7つの時間帯セットです。Skyboxに設定して使い、空色・雲の明暗・光のふちを調整できます。静止した空で、現在時刻への自動追従や飛行機・鳥は含みません。",
    "tags": [
      "skybox-creator",
      "時間帯セット",
      "一日の空",
      "PNG",
      "雲"
    ],
    "cost": "light",
    "preview": {
      "azimuth": 105,
      "elevation": 12
    },
    "uniforms": {
      "uCenter": {
        "kind": "vector",
        "value": [
          0,
          0,
          0
        ]
      },
      "uRotation": {
        "kind": "number",
        "value": 0
      },
      "uExposure": {
        "kind": "number",
        "value": 1
      },
      "uZenith": {
        "kind": "color",
        "value": "#3e467b"
      },
      "uUpper": {
        "kind": "color",
        "value": "#a18ba9"
      },
      "uHorizon": {
        "kind": "color",
        "value": "#ffd5ae"
      },
      "uGround": {
        "kind": "color",
        "value": "#776e91"
      },
      "uCloudLight": {
        "kind": "color",
        "value": "#ffd9c3"
      },
      "uCloudShadow": {
        "kind": "color",
        "value": "#81779b"
      },
      "uCloudRim": {
        "kind": "color",
        "value": "#ffc39f"
      },
      "uSunColor": {
        "kind": "color",
        "value": "#fff1cf"
      },
      "uGlowColor": {
        "kind": "color",
        "value": "#ffb57e"
      },
      "uHaze": {
        "kind": "number",
        "value": 0.42
      },
      "uGradient": {
        "kind": "number",
        "value": 0.47000000000000003
      },
      "uPaletteExposureEV": {
        "kind": "number",
        "value": 0
      },
      "uCloudAmount": {
        "kind": "number",
        "value": 0.46
      },
      "uCloudScale": {
        "kind": "number",
        "value": 0.56
      },
      "uCloudSoftness": {
        "kind": "number",
        "value": 0.64
      },
      "uCloudHeight": {
        "kind": "number",
        "value": 0.26666666666666666
      },
      "uCloudRimStrength": {
        "kind": "number",
        "value": 0.5700000000000001
      },
      "uSunAltitude": {
        "kind": "number",
        "value": -0.03490658503988659
      },
      "uSunAzimuth": {
        "kind": "number",
        "value": -0.2617993877991494
      },
      "uSunSize": {
        "kind": "number",
        "value": 0.020943951023931952
      },
      "uSunIntensity": {
        "kind": "number",
        "value": 1.05
      },
      "uGlow": {
        "kind": "number",
        "value": 0.52
      },
      "uStars": {
        "kind": "number",
        "value": 0.06
      },
      "uStarBrightness": {
        "kind": "number",
        "value": 0.55
      },
      "uSeed": {
        "kind": "number",
        "value": 42
      }
    }
  },
  {
    "id": "creator-morning",
    "label": "澄んだ朝 · Skybox Creator",
    "category": "dawn",
    "description": "澄んだ朝の空。雲の形を揃えた7つの時間帯セットです。Skyboxに設定して使い、空色・雲の明暗・光のふちを調整できます。静止した空で、現在時刻への自動追従や飛行機・鳥は含みません。",
    "tags": [
      "skybox-creator",
      "時間帯セット",
      "一日の空",
      "PNG",
      "雲"
    ],
    "cost": "light",
    "preview": {
      "azimuth": 74,
      "elevation": 12
    },
    "uniforms": {
      "uCenter": {
        "kind": "vector",
        "value": [
          0,
          0,
          0
        ]
      },
      "uRotation": {
        "kind": "number",
        "value": 0
      },
      "uExposure": {
        "kind": "number",
        "value": 1
      },
      "uZenith": {
        "kind": "color",
        "value": "#527eae"
      },
      "uUpper": {
        "kind": "color",
        "value": "#9bc5df"
      },
      "uHorizon": {
        "kind": "color",
        "value": "#f7e6d3"
      },
      "uGround": {
        "kind": "color",
        "value": "#aabaca"
      },
      "uCloudLight": {
        "kind": "color",
        "value": "#fff1db"
      },
      "uCloudShadow": {
        "kind": "color",
        "value": "#9cabc2"
      },
      "uCloudRim": {
        "kind": "color",
        "value": "#ffdda8"
      },
      "uSunColor": {
        "kind": "color",
        "value": "#fff5d8"
      },
      "uGlowColor": {
        "kind": "color",
        "value": "#ffd49b"
      },
      "uHaze": {
        "kind": "number",
        "value": 0.29
      },
      "uGradient": {
        "kind": "number",
        "value": 0.47000000000000003
      },
      "uPaletteExposureEV": {
        "kind": "number",
        "value": 0
      },
      "uCloudAmount": {
        "kind": "number",
        "value": 0.46
      },
      "uCloudScale": {
        "kind": "number",
        "value": 0.56
      },
      "uCloudSoftness": {
        "kind": "number",
        "value": 0.64
      },
      "uCloudHeight": {
        "kind": "number",
        "value": 0.26666666666666666
      },
      "uCloudRimStrength": {
        "kind": "number",
        "value": 0.5700000000000001
      },
      "uSunAltitude": {
        "kind": "number",
        "value": 0.4014257279586958
      },
      "uSunAzimuth": {
        "kind": "number",
        "value": 0.2792526803190927
      },
      "uSunSize": {
        "kind": "number",
        "value": 0.020943951023931952
      },
      "uSunIntensity": {
        "kind": "number",
        "value": 1.05
      },
      "uGlow": {
        "kind": "number",
        "value": 0.35000000000000003
      },
      "uStars": {
        "kind": "number",
        "value": 0
      },
      "uStarBrightness": {
        "kind": "number",
        "value": 0.55
      },
      "uSeed": {
        "kind": "number",
        "value": 42
      }
    }
  },
  {
    "id": "creator-day",
    "label": "昼の青空 · Skybox Creator",
    "category": "day",
    "description": "昼の青空の空。雲の形を揃えた7つの時間帯セットです。Skyboxに設定して使い、空色・雲の明暗・光のふちを調整できます。静止した空で、現在時刻への自動追従や飛行機・鳥は含みません。",
    "tags": [
      "skybox-creator",
      "時間帯セット",
      "一日の空",
      "PNG",
      "雲"
    ],
    "cost": "light",
    "preview": {
      "azimuth": 65,
      "elevation": 12
    },
    "uniforms": {
      "uCenter": {
        "kind": "vector",
        "value": [
          0,
          0,
          0
        ]
      },
      "uRotation": {
        "kind": "number",
        "value": 0
      },
      "uExposure": {
        "kind": "number",
        "value": 1
      },
      "uZenith": {
        "kind": "color",
        "value": "#245d9d"
      },
      "uUpper": {
        "kind": "color",
        "value": "#69afe0"
      },
      "uHorizon": {
        "kind": "color",
        "value": "#d0e7ec"
      },
      "uGround": {
        "kind": "color",
        "value": "#9fb9c9"
      },
      "uCloudLight": {
        "kind": "color",
        "value": "#f9fbf5"
      },
      "uCloudShadow": {
        "kind": "color",
        "value": "#a1b6d0"
      },
      "uCloudRim": {
        "kind": "color",
        "value": "#fff6d5"
      },
      "uSunColor": {
        "kind": "color",
        "value": "#fffbea"
      },
      "uGlowColor": {
        "kind": "color",
        "value": "#fff2c8"
      },
      "uHaze": {
        "kind": "number",
        "value": 0.24
      },
      "uGradient": {
        "kind": "number",
        "value": 0.47000000000000003
      },
      "uPaletteExposureEV": {
        "kind": "number",
        "value": 0
      },
      "uCloudAmount": {
        "kind": "number",
        "value": 0.46
      },
      "uCloudScale": {
        "kind": "number",
        "value": 0.56
      },
      "uCloudSoftness": {
        "kind": "number",
        "value": 0.64
      },
      "uCloudHeight": {
        "kind": "number",
        "value": 0.26666666666666666
      },
      "uCloudRimStrength": {
        "kind": "number",
        "value": 0.34
      },
      "uSunAltitude": {
        "kind": "number",
        "value": 0.9948376736367679
      },
      "uSunAzimuth": {
        "kind": "number",
        "value": 0.4363323129985824
      },
      "uSunSize": {
        "kind": "number",
        "value": 0.012217304763960306
      },
      "uSunIntensity": {
        "kind": "number",
        "value": 1.2
      },
      "uGlow": {
        "kind": "number",
        "value": 0.24
      },
      "uStars": {
        "kind": "number",
        "value": 0
      },
      "uStarBrightness": {
        "kind": "number",
        "value": 0.55
      },
      "uSeed": {
        "kind": "number",
        "value": 42
      }
    }
  },
  {
    "id": "creator-golden",
    "label": "黄金の時間 · Skybox Creator",
    "category": "dusk",
    "description": "黄金の時間の空。雲の形を揃えた7つの時間帯セットです。Skyboxに設定して使い、空色・雲の明暗・光のふちを調整できます。静止した空で、現在時刻への自動追従や飛行機・鳥は含みません。",
    "tags": [
      "skybox-creator",
      "時間帯セット",
      "一日の空",
      "PNG",
      "雲"
    ],
    "cost": "light",
    "preview": {
      "azimuth": 73,
      "elevation": 12
    },
    "uniforms": {
      "uCenter": {
        "kind": "vector",
        "value": [
          0,
          0,
          0
        ]
      },
      "uRotation": {
        "kind": "number",
        "value": 0
      },
      "uExposure": {
        "kind": "number",
        "value": 1
      },
      "uZenith": {
        "kind": "color",
        "value": "#5b79aa"
      },
      "uUpper": {
        "kind": "color",
        "value": "#b7b3c6"
      },
      "uHorizon": {
        "kind": "color",
        "value": "#ffd093"
      },
      "uGround": {
        "kind": "color",
        "value": "#9a8592"
      },
      "uCloudLight": {
        "kind": "color",
        "value": "#ffe4ba"
      },
      "uCloudShadow": {
        "kind": "color",
        "value": "#9586a4"
      },
      "uCloudRim": {
        "kind": "color",
        "value": "#ffcc7a"
      },
      "uSunColor": {
        "kind": "color",
        "value": "#fff0bd"
      },
      "uGlowColor": {
        "kind": "color",
        "value": "#ffc274"
      },
      "uHaze": {
        "kind": "number",
        "value": 0.37
      },
      "uGradient": {
        "kind": "number",
        "value": 0.47000000000000003
      },
      "uPaletteExposureEV": {
        "kind": "number",
        "value": 0
      },
      "uCloudAmount": {
        "kind": "number",
        "value": 0.46
      },
      "uCloudScale": {
        "kind": "number",
        "value": 0.56
      },
      "uCloudSoftness": {
        "kind": "number",
        "value": 0.64
      },
      "uCloudHeight": {
        "kind": "number",
        "value": 0.26666666666666666
      },
      "uCloudRimStrength": {
        "kind": "number",
        "value": 0.72
      },
      "uSunAltitude": {
        "kind": "number",
        "value": 0.20943951023931956
      },
      "uSunAzimuth": {
        "kind": "number",
        "value": 0.29670597283903605
      },
      "uSunSize": {
        "kind": "number",
        "value": 0.017453292519943295
      },
      "uSunIntensity": {
        "kind": "number",
        "value": 1.1500000000000001
      },
      "uGlow": {
        "kind": "number",
        "value": 0.58
      },
      "uStars": {
        "kind": "number",
        "value": 0
      },
      "uStarBrightness": {
        "kind": "number",
        "value": 0.55
      },
      "uSeed": {
        "kind": "number",
        "value": 42
      }
    }
  },
  {
    "id": "creator-sunset",
    "label": "茜の夕空 · Skybox Creator",
    "category": "dusk",
    "description": "茜の夕空の空。雲の形を揃えた7つの時間帯セットです。Skyboxに設定して使い、空色・雲の明暗・光のふちを調整できます。静止した空で、現在時刻への自動追従や飛行機・鳥は含みません。",
    "tags": [
      "skybox-creator",
      "時間帯セット",
      "一日の空",
      "PNG",
      "雲"
    ],
    "cost": "light",
    "preview": {
      "azimuth": 74,
      "elevation": 12
    },
    "uniforms": {
      "uCenter": {
        "kind": "vector",
        "value": [
          0,
          0,
          0
        ]
      },
      "uRotation": {
        "kind": "number",
        "value": 0
      },
      "uExposure": {
        "kind": "number",
        "value": 1
      },
      "uZenith": {
        "kind": "color",
        "value": "#484478"
      },
      "uUpper": {
        "kind": "color",
        "value": "#be87a0"
      },
      "uHorizon": {
        "kind": "color",
        "value": "#ffc19a"
      },
      "uGround": {
        "kind": "color",
        "value": "#746580"
      },
      "uCloudLight": {
        "kind": "color",
        "value": "#ffd3b4"
      },
      "uCloudShadow": {
        "kind": "color",
        "value": "#77678d"
      },
      "uCloudRim": {
        "kind": "color",
        "value": "#ffb78e"
      },
      "uSunColor": {
        "kind": "color",
        "value": "#fff1cf"
      },
      "uGlowColor": {
        "kind": "color",
        "value": "#ffb57e"
      },
      "uHaze": {
        "kind": "number",
        "value": 0.42
      },
      "uGradient": {
        "kind": "number",
        "value": 0.47000000000000003
      },
      "uPaletteExposureEV": {
        "kind": "number",
        "value": 0
      },
      "uCloudAmount": {
        "kind": "number",
        "value": 0.46
      },
      "uCloudScale": {
        "kind": "number",
        "value": 0.56
      },
      "uCloudSoftness": {
        "kind": "number",
        "value": 0.64
      },
      "uCloudHeight": {
        "kind": "number",
        "value": 0.26666666666666666
      },
      "uCloudRimStrength": {
        "kind": "number",
        "value": 0.5700000000000001
      },
      "uSunAltitude": {
        "kind": "number",
        "value": 0.08726646259971647
      },
      "uSunAzimuth": {
        "kind": "number",
        "value": 0.2792526803190927
      },
      "uSunSize": {
        "kind": "number",
        "value": 0.020943951023931952
      },
      "uSunIntensity": {
        "kind": "number",
        "value": 1.05
      },
      "uGlow": {
        "kind": "number",
        "value": 0.66
      },
      "uStars": {
        "kind": "number",
        "value": 0
      },
      "uStarBrightness": {
        "kind": "number",
        "value": 0.55
      },
      "uSeed": {
        "kind": "number",
        "value": 42
      }
    }
  },
  {
    "id": "creator-twilight",
    "label": "青い薄明 · Skybox Creator",
    "category": "dusk",
    "description": "青い薄明の空。雲の形を揃えた7つの時間帯セットです。Skyboxに設定して使い、空色・雲の明暗・光のふちを調整できます。静止した空で、現在時刻への自動追従や飛行機・鳥は含みません。",
    "tags": [
      "skybox-creator",
      "時間帯セット",
      "一日の空",
      "PNG",
      "雲"
    ],
    "cost": "light",
    "preview": {
      "azimuth": 74,
      "elevation": 12
    },
    "uniforms": {
      "uCenter": {
        "kind": "vector",
        "value": [
          0,
          0,
          0
        ]
      },
      "uRotation": {
        "kind": "number",
        "value": 0
      },
      "uExposure": {
        "kind": "number",
        "value": 1
      },
      "uZenith": {
        "kind": "color",
        "value": "#1b2549"
      },
      "uUpper": {
        "kind": "color",
        "value": "#665b91"
      },
      "uHorizon": {
        "kind": "color",
        "value": "#e7a8aa"
      },
      "uGround": {
        "kind": "color",
        "value": "#41445e"
      },
      "uCloudLight": {
        "kind": "color",
        "value": "#b698be"
      },
      "uCloudShadow": {
        "kind": "color",
        "value": "#474866"
      },
      "uCloudRim": {
        "kind": "color",
        "value": "#e7b4c5"
      },
      "uSunColor": {
        "kind": "color",
        "value": "#ffc7aa"
      },
      "uGlowColor": {
        "kind": "color",
        "value": "#dd8fa4"
      },
      "uHaze": {
        "kind": "number",
        "value": 0.31
      },
      "uGradient": {
        "kind": "number",
        "value": 0.47000000000000003
      },
      "uPaletteExposureEV": {
        "kind": "number",
        "value": 0
      },
      "uCloudAmount": {
        "kind": "number",
        "value": 0.46
      },
      "uCloudScale": {
        "kind": "number",
        "value": 0.56
      },
      "uCloudSoftness": {
        "kind": "number",
        "value": 0.64
      },
      "uCloudHeight": {
        "kind": "number",
        "value": 0.26666666666666666
      },
      "uCloudRimStrength": {
        "kind": "number",
        "value": 0.29
      },
      "uSunAltitude": {
        "kind": "number",
        "value": -0.12217304763960307
      },
      "uSunAzimuth": {
        "kind": "number",
        "value": 0.2792526803190927
      },
      "uSunSize": {
        "kind": "number",
        "value": 0.020943951023931952
      },
      "uSunIntensity": {
        "kind": "number",
        "value": 0.45
      },
      "uGlow": {
        "kind": "number",
        "value": 0.38
      },
      "uStars": {
        "kind": "number",
        "value": 0.24
      },
      "uStarBrightness": {
        "kind": "number",
        "value": 0.55
      },
      "uSeed": {
        "kind": "number",
        "value": 42
      }
    }
  },
  {
    "id": "creator-night",
    "label": "星の夜 · Skybox Creator",
    "category": "night",
    "description": "星の夜の空。雲の形を揃えた7つの時間帯セットです。Skyboxに設定して使い、空色・雲の明暗・光のふちを調整できます。静止した空で、現在時刻への自動追従や飛行機・鳥は含みません。",
    "tags": [
      "skybox-creator",
      "時間帯セット",
      "一日の空",
      "PNG",
      "雲"
    ],
    "cost": "light",
    "preview": {
      "azimuth": 74,
      "elevation": 12
    },
    "uniforms": {
      "uCenter": {
        "kind": "vector",
        "value": [
          0,
          0,
          0
        ]
      },
      "uRotation": {
        "kind": "number",
        "value": 0
      },
      "uExposure": {
        "kind": "number",
        "value": 1
      },
      "uZenith": {
        "kind": "color",
        "value": "#0b102b"
      },
      "uUpper": {
        "kind": "color",
        "value": "#192444"
      },
      "uHorizon": {
        "kind": "color",
        "value": "#41445d"
      },
      "uGround": {
        "kind": "color",
        "value": "#1a2037"
      },
      "uCloudLight": {
        "kind": "color",
        "value": "#526080"
      },
      "uCloudShadow": {
        "kind": "color",
        "value": "#222e4b"
      },
      "uCloudRim": {
        "kind": "color",
        "value": "#7781a6"
      },
      "uSunColor": {
        "kind": "color",
        "value": "#b5c9ff"
      },
      "uGlowColor": {
        "kind": "color",
        "value": "#738cce"
      },
      "uHaze": {
        "kind": "number",
        "value": 0.23
      },
      "uGradient": {
        "kind": "number",
        "value": 0.47000000000000003
      },
      "uPaletteExposureEV": {
        "kind": "number",
        "value": 0
      },
      "uCloudAmount": {
        "kind": "number",
        "value": 0.46
      },
      "uCloudScale": {
        "kind": "number",
        "value": 0.56
      },
      "uCloudSoftness": {
        "kind": "number",
        "value": 0.64
      },
      "uCloudHeight": {
        "kind": "number",
        "value": 0.26666666666666666
      },
      "uCloudRimStrength": {
        "kind": "number",
        "value": 0.15
      },
      "uSunAltitude": {
        "kind": "number",
        "value": -0.4014257279586958
      },
      "uSunAzimuth": {
        "kind": "number",
        "value": 0.2792526803190927
      },
      "uSunSize": {
        "kind": "number",
        "value": 0.020943951023931952
      },
      "uSunIntensity": {
        "kind": "number",
        "value": 0
      },
      "uGlow": {
        "kind": "number",
        "value": 0.08
      },
      "uStars": {
        "kind": "number",
        "value": 0.76
      },
      "uStarBrightness": {
        "kind": "number",
        "value": 0.72
      },
      "uSeed": {
        "kind": "number",
        "value": 42
      }
    }
  }
];
export const SKYBOX_CREATOR_CATALOG:readonly SkyShaderCatalogEntry[]=entries.map(({uniforms,...entry})=>({...entry,parameters,shader:{kind:'classic-r3f',sourceModulePath:'studio://sky-shader/'+entry.id,vertexShader:SKY_VERTEX_SHADER,fragmentShader,uniforms:structuredClone(uniforms),variants:[{name:'sky',defines:{},side:'back',transparent:false,depthWrite:false}]}}));
