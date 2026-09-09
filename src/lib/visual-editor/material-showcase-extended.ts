import type { MaterialShowcaseDefinition } from "./material-showcase-catalog";
/** Authored comparisons. Not color-only variants: each has a surface/parameter lesson. */
export type ExtendedMaterialShowcase = MaterialShowcaseDefinition & {
 sampleModel: string; group: string; description: string; note: string;
 labels: readonly [string, string]; tags: readonly string[];
};
export const EXTENDED_MATERIAL_SHOWCASES: readonly ExtendedMaterialShowcase[] = [
  {
    "key": "clearcoat-carbon",
    "name": "Clearcoat / カーボン",
    "extensionLabel": "KHR_materials_clearcoat",
    "base": {
      "color": "#ffffff",
      "metalness": 1,
      "roughness": 1
    },
    "extensions": {
      "KHR_materials_clearcoat": {
        "clearcoatFactor": 1,
        "clearcoatRoughnessFactor": 0.035
      }
    },
    "baselineName": "Clearcoat / カーボン（比較）",
    "baselineExtensions": {},
    "patch": {
      "baseColorTextureId": "texture-catalog-carbon-color-9aff8702d5f5",
      "normalTexture": {
        "textureAssetId": "texture-catalog-carbon-normal-4eff5b29a9cd",
        "texCoord": 0,
        "scale": 0.5
      },
      "metallicRoughnessTextureId": "texture-catalog-carbon-orm-d3734d68154e",
      "occlusionTextureId": "texture-catalog-carbon-orm-d3734d68154e"
    },
    "sampleModel": "catalog-shaderball",
    "group": "Clearcoat",
    "description": "織り模様の上に、鋭いコーティングの反射を重ねます。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Clearcoat 1",
      "Clearcoat 0"
    ],
    "tags": [
      "コーティング",
      "テクスチャ"
    ]
  },
  {
    "key": "clearcoat-wood",
    "name": "Clearcoat / ニス仕上げの木",
    "extensionLabel": "KHR_materials_clearcoat",
    "base": {
      "color": "#ffffff",
      "metalness": 0,
      "roughness": 1
    },
    "extensions": {
      "KHR_materials_clearcoat": {
        "clearcoatFactor": 1,
        "clearcoatRoughnessFactor": 0.09
      }
    },
    "baselineName": "Clearcoat / ニス仕上げの木（比較）",
    "baselineExtensions": {},
    "patch": {
      "baseColorTextureId": "texture-catalog-wood-color-ca0256698184",
      "normalTexture": {
        "textureAssetId": "texture-catalog-wood-normal-d0e385fcf1ed",
        "texCoord": 0,
        "scale": 0.5
      },
      "metallicRoughnessTextureId": "texture-catalog-wood-orm-f4abb7ebed61",
      "occlusionTextureId": "texture-catalog-wood-orm-f4abb7ebed61"
    },
    "sampleModel": "catalog-vase",
    "group": "Clearcoat",
    "description": "木目とNormal Mapを残したまま、ニスの光沢を比較します。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Clearcoat 1",
      "Clearcoat 0"
    ],
    "tags": [
      "コーティング",
      "テクスチャ"
    ]
  },
  {
    "key": "clearcoat-ceramic",
    "name": "Clearcoat / 釉薬の陶器",
    "extensionLabel": "KHR_materials_clearcoat",
    "base": {
      "color": "#ffffff",
      "metalness": 0,
      "roughness": 1
    },
    "extensions": {
      "KHR_materials_clearcoat": {
        "clearcoatFactor": 1,
        "clearcoatRoughnessFactor": 0.025
      }
    },
    "baselineName": "Clearcoat / 釉薬の陶器（比較）",
    "baselineExtensions": {},
    "patch": {
      "baseColorTextureId": "texture-catalog-ceramic-color-b518fe66a374",
      "normalTexture": {
        "textureAssetId": "texture-catalog-ceramic-normal-2c8b19249db5",
        "texCoord": 0,
        "scale": 0.5
      },
      "metallicRoughnessTextureId": "texture-catalog-ceramic-orm-f77805a3cd4f",
      "occlusionTextureId": "texture-catalog-ceramic-orm-f77805a3cd4f"
    },
    "sampleModel": "catalog-vase",
    "group": "Clearcoat",
    "description": "タイル模様の陶器に、滑らかな釉薬の層を重ねます。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Clearcoat 1",
      "Clearcoat 0"
    ],
    "tags": [
      "コーティング",
      "テクスチャ"
    ]
  },
  {
    "key": "clearcoat-satin",
    "name": "Clearcoat / サテン塗装",
    "extensionLabel": "KHR_materials_clearcoat",
    "base": {
      "color": "#ffffff",
      "metalness": 1,
      "roughness": 1
    },
    "extensions": {
      "KHR_materials_clearcoat": {
        "clearcoatFactor": 1,
        "clearcoatRoughnessFactor": 0.4
      }
    },
    "baselineName": "Clearcoat / サテン塗装（比較）",
    "baselineExtensions": {},
    "patch": {
      "baseColorTextureId": "texture-catalog-hammered-color-e0e64398951a",
      "normalTexture": {
        "textureAssetId": "texture-catalog-hammered-normal-2f510faa5640",
        "texCoord": 0,
        "scale": 0.5
      },
      "metallicRoughnessTextureId": "texture-catalog-hammered-orm-c253d1b1406e",
      "occlusionTextureId": "texture-catalog-hammered-orm-c253d1b1406e"
    },
    "sampleModel": "catalog-knob",
    "group": "Clearcoat",
    "description": "粗いコーティングで、広く柔らかいハイライトを作ります。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Clearcoat 1",
      "Clearcoat 0"
    ],
    "tags": [
      "コーティング",
      "テクスチャ"
    ]
  },
  {
    "key": "transmission-frosted",
    "name": "Transmission / すりガラス",
    "extensionLabel": "KHR_materials_transmission",
    "base": {
      "color": "#ffffff",
      "metalness": 0,
      "roughness": 0.38
    },
    "extensions": {
      "KHR_materials_transmission": {
        "transmissionFactor": 1
      },
      "KHR_materials_ior": {
        "ior": 1.5
      }
    },
    "baselineName": "Transmission / すりガラス（比較）",
    "baselineExtensions": {},
    "patch": {
      "normalTexture": {
        "textureAssetId": "texture-catalog-frosted-normal-8506b941385f",
        "texCoord": 0,
        "scale": 0.75
      }
    },
    "sampleModel": "catalog-vase",
    "group": "Transmission",
    "description": "Roughnessと細かな凹凸で、透けた背景をぼかします。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Transmission 1",
      "Transmission 0"
    ],
    "tags": [
      "透明",
      "ガラス",
      "テクスチャ"
    ]
  },
  {
    "key": "transmission-ribbed",
    "name": "Transmission / 筋入りガラス",
    "extensionLabel": "KHR_materials_transmission",
    "base": {
      "color": "#ffffff",
      "metalness": 0,
      "roughness": 0.08
    },
    "extensions": {
      "KHR_materials_transmission": {
        "transmissionFactor": 1
      },
      "KHR_materials_ior": {
        "ior": 1.5
      }
    },
    "baselineName": "Transmission / 筋入りガラス（比較）",
    "baselineExtensions": {},
    "patch": {
      "normalTexture": {
        "textureAssetId": "texture-catalog-brushed-normal-c83f7f1c3042",
        "texCoord": 0,
        "scale": 0.75
      }
    },
    "sampleModel": "catalog-bottle",
    "group": "Transmission",
    "description": "Normal Mapの筋が、透けた背景と反射を歪めます。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Transmission 1",
      "Transmission 0"
    ],
    "tags": [
      "透明",
      "ガラス",
      "テクスチャ"
    ]
  },
  {
    "key": "transmission-hammered",
    "name": "Transmission / 槌目ガラス",
    "extensionLabel": "KHR_materials_transmission",
    "base": {
      "color": "#ffffff",
      "metalness": 0,
      "roughness": 0.1
    },
    "extensions": {
      "KHR_materials_transmission": {
        "transmissionFactor": 1
      },
      "KHR_materials_ior": {
        "ior": 1.5
      }
    },
    "baselineName": "Transmission / 槌目ガラス（比較）",
    "baselineExtensions": {},
    "patch": {
      "normalTexture": {
        "textureAssetId": "texture-catalog-hammered-normal-2f510faa5640",
        "texCoord": 0,
        "scale": 0.75
      }
    },
    "sampleModel": "catalog-vase",
    "group": "Transmission",
    "description": "槌目のNormal Mapを使った、凹凸のある透過表現です。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Transmission 1",
      "Transmission 0"
    ],
    "tags": [
      "透明",
      "ガラス",
      "テクスチャ"
    ]
  },
  {
    "key": "transmission-acrylic",
    "name": "Transmission / アクリル板",
    "extensionLabel": "KHR_materials_transmission",
    "base": {
      "color": "#ffffff",
      "metalness": 0,
      "roughness": 0.035
    },
    "extensions": {
      "KHR_materials_transmission": {
        "transmissionFactor": 1
      },
      "KHR_materials_ior": {
        "ior": 1.5
      }
    },
    "baselineName": "Transmission / アクリル板（比較）",
    "baselineExtensions": {},
    "patch": {},
    "sampleModel": "catalog-tile",
    "group": "Transmission",
    "description": "AlphaではなくTransmissionで、背景を透かす板を作ります。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Transmission 1",
      "Transmission 0"
    ],
    "tags": [
      "透明",
      "アクリル"
    ]
  },
  {
    "key": "volume-amber",
    "name": "Volume / 琥珀色の瓶",
    "extensionLabel": "KHR_materials_volume",
    "base": {
      "color": "#ffffff",
      "metalness": 0,
      "roughness": 0.06
    },
    "extensions": {
      "KHR_materials_transmission": {
        "transmissionFactor": 1
      },
      "KHR_materials_ior": {
        "ior": 1.5
      },
      "KHR_materials_volume": {
        "thicknessFactor": 0.65,
        "attenuationColor": [
          0.82,
          0.36,
          0.075
        ],
        "attenuationDistance": 0.3
      }
    },
    "baselineName": "Volume / 琥珀色の瓶（比較）",
    "baselineExtensions": {
      "KHR_materials_transmission": {
        "transmissionFactor": 1
      },
      "KHR_materials_ior": {
        "ior": 1.5
      }
    },
    "patch": {},
    "sampleModel": "catalog-bottle",
    "group": "Volume",
    "description": "厚みを通過する光に色が付きます。基本色を同じにして、吸収の有無を比べます。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Volume ON",
      "Volume OFF"
    ],
    "tags": [
      "吸収",
      "色ガラス"
    ]
  },
  {
    "key": "volume-ink",
    "name": "Volume / 青いインクガラス",
    "extensionLabel": "KHR_materials_volume",
    "base": {
      "color": "#ffffff",
      "metalness": 0,
      "roughness": 0.06
    },
    "extensions": {
      "KHR_materials_transmission": {
        "transmissionFactor": 1
      },
      "KHR_materials_ior": {
        "ior": 1.5
      },
      "KHR_materials_volume": {
        "thicknessFactor": 0.65,
        "attenuationColor": [
          0.08,
          0.32,
          0.78
        ],
        "attenuationDistance": 0.28
      }
    },
    "baselineName": "Volume / 青いインクガラス（比較）",
    "baselineExtensions": {
      "KHR_materials_transmission": {
        "transmissionFactor": 1
      },
      "KHR_materials_ior": {
        "ior": 1.5
      }
    },
    "patch": {},
    "sampleModel": "catalog-vase",
    "group": "Volume",
    "description": "厚みを通過する光に色が付きます。基本色を同じにして、吸収の有無を比べます。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Volume ON",
      "Volume OFF"
    ],
    "tags": [
      "吸収",
      "色ガラス"
    ]
  },
  {
    "key": "volume-smoke",
    "name": "Volume / スモークガラス",
    "extensionLabel": "KHR_materials_volume",
    "base": {
      "color": "#ffffff",
      "metalness": 0,
      "roughness": 0.06
    },
    "extensions": {
      "KHR_materials_transmission": {
        "transmissionFactor": 1
      },
      "KHR_materials_ior": {
        "ior": 1.5
      },
      "KHR_materials_volume": {
        "thicknessFactor": 0.65,
        "attenuationColor": [
          0.26,
          0.27,
          0.31
        ],
        "attenuationDistance": 0.6
      }
    },
    "baselineName": "Volume / スモークガラス（比較）",
    "baselineExtensions": {
      "KHR_materials_transmission": {
        "transmissionFactor": 1
      },
      "KHR_materials_ior": {
        "ior": 1.5
      }
    },
    "patch": {},
    "sampleModel": "catalog-shaderball",
    "group": "Volume",
    "description": "厚みを通過する光に色が付きます。基本色を同じにして、吸収の有無を比べます。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Volume ON",
      "Volume OFF"
    ],
    "tags": [
      "吸収",
      "色ガラス"
    ]
  },
  {
    "key": "dispersion-cut",
    "name": "Dispersion / カットガラス",
    "extensionLabel": "KHR_materials_dispersion",
    "base": {
      "color": "#ffffff",
      "metalness": 0,
      "roughness": 0.015
    },
    "extensions": {
      "KHR_materials_transmission": {
        "transmissionFactor": 1
      },
      "KHR_materials_ior": {
        "ior": 1.65
      },
      "KHR_materials_volume": {
        "thicknessFactor": 0.75,
        "attenuationColor": [
          1,
          1,
          1
        ],
        "attenuationDistance": 0.4
      },
      "KHR_materials_dispersion": {
        "dispersion": 0.6
      }
    },
    "baselineName": "Dispersion / カットガラス（比較）",
    "baselineExtensions": {
      "KHR_materials_transmission": {
        "transmissionFactor": 1
      },
      "KHR_materials_ior": {
        "ior": 1.65
      },
      "KHR_materials_volume": {
        "thicknessFactor": 0.75,
        "attenuationColor": [
          1,
          1,
          1
        ],
        "attenuationDistance": 0.4
      }
    },
    "patch": {},
    "sampleModel": "catalog-gem",
    "group": "Dispersion",
    "description": "カットされた面を通した背景で、色の分かれ方を比較します。",
    "note": "TransmissionとVolumeを保った比較です。分散は屈折した背景に現れます。プレビューは実際のMeshPhysicalMaterialを使います。",
    "labels": [
      "Dispersion 0.6",
      "Dispersion 0"
    ],
    "tags": [
      "宝石",
      "分散"
    ]
  },
  {
    "key": "dispersion-jewel",
    "name": "Dispersion / ジュエル",
    "extensionLabel": "KHR_materials_dispersion",
    "base": {
      "color": "#ffffff",
      "metalness": 0,
      "roughness": 0.015
    },
    "extensions": {
      "KHR_materials_transmission": {
        "transmissionFactor": 1
      },
      "KHR_materials_ior": {
        "ior": 2.1
      },
      "KHR_materials_volume": {
        "thicknessFactor": 0.75,
        "attenuationColor": [
          1,
          1,
          1
        ],
        "attenuationDistance": 0.4
      },
      "KHR_materials_dispersion": {
        "dispersion": 1.1
      }
    },
    "baselineName": "Dispersion / ジュエル（比較）",
    "baselineExtensions": {
      "KHR_materials_transmission": {
        "transmissionFactor": 1
      },
      "KHR_materials_ior": {
        "ior": 2.1
      },
      "KHR_materials_volume": {
        "thicknessFactor": 0.75,
        "attenuationColor": [
          1,
          1,
          1
        ],
        "attenuationDistance": 0.4
      }
    },
    "patch": {},
    "sampleModel": "catalog-gem",
    "group": "Dispersion",
    "description": "カットされた面を通した背景で、色の分かれ方を比較します。",
    "note": "TransmissionとVolumeを保った比較です。分散は屈折した背景に現れます。プレビューは実際のMeshPhysicalMaterialを使います。",
    "labels": [
      "Dispersion 1.1",
      "Dispersion 0"
    ],
    "tags": [
      "宝石",
      "分散"
    ]
  },
  {
    "key": "iridescence-foil",
    "name": "Iridescence / ホログラム箔",
    "extensionLabel": "KHR_materials_iridescence",
    "base": {
      "color": "#ffffff",
      "metalness": 1,
      "roughness": 0.6
    },
    "extensions": {
      "KHR_materials_iridescence": {
        "iridescenceFactor": 1,
        "iridescenceIor": 1.8,
        "iridescenceThicknessMinimum": 150,
        "iridescenceThicknessMaximum": 480
      }
    },
    "baselineName": "Iridescence / ホログラム箔（比較）",
    "baselineExtensions": {},
    "patch": {
      "baseColorTextureId": "texture-catalog-foil-color-b44c9fe88701",
      "normalTexture": {
        "textureAssetId": "texture-catalog-foil-normal-4e72b1d70568",
        "texCoord": 0,
        "scale": 0.5
      },
      "metallicRoughnessTextureId": "texture-catalog-foil-orm-d215d0cf0673",
      "occlusionTextureId": "texture-catalog-foil-orm-d215d0cf0673"
    },
    "sampleModel": "catalog-tile",
    "group": "Iridescence",
    "description": "見る角度による色の変化を、表面の模様と組み合わせます。",
    "note": "角度による反射色の変化を比べます。厚みテクスチャのない面ではThickness Maximumが使われます。",
    "labels": [
      "Iridescence 1",
      "Iridescence 0"
    ],
    "tags": [
      "薄膜",
      "虹色",
      "テクスチャ"
    ]
  },
  {
    "key": "iridescence-pearl",
    "name": "Iridescence / 真珠塗装",
    "extensionLabel": "KHR_materials_iridescence",
    "base": {
      "color": "#ffffff",
      "metalness": 0,
      "roughness": 0.6
    },
    "extensions": {
      "KHR_materials_iridescence": {
        "iridescenceFactor": 1,
        "iridescenceIor": 1.8,
        "iridescenceThicknessMinimum": 150,
        "iridescenceThicknessMaximum": 480
      }
    },
    "baselineName": "Iridescence / 真珠塗装（比較）",
    "baselineExtensions": {},
    "patch": {
      "baseColorTextureId": "texture-catalog-ceramic-color-b518fe66a374",
      "normalTexture": {
        "textureAssetId": "texture-catalog-ceramic-normal-2c8b19249db5",
        "texCoord": 0,
        "scale": 0.5
      },
      "metallicRoughnessTextureId": "texture-catalog-ceramic-orm-f77805a3cd4f",
      "occlusionTextureId": "texture-catalog-ceramic-orm-f77805a3cd4f"
    },
    "sampleModel": "catalog-vase",
    "group": "Iridescence",
    "description": "見る角度による色の変化を、表面の模様と組み合わせます。",
    "note": "角度による反射色の変化を比べます。厚みテクスチャのない面ではThickness Maximumが使われます。",
    "labels": [
      "Iridescence 1",
      "Iridescence 0"
    ],
    "tags": [
      "薄膜",
      "虹色",
      "テクスチャ"
    ]
  },
  {
    "key": "iridescence-anodized",
    "name": "Iridescence / 薄膜金属",
    "extensionLabel": "KHR_materials_iridescence",
    "base": {
      "color": "#ffffff",
      "metalness": 1,
      "roughness": 0.6
    },
    "extensions": {
      "KHR_materials_iridescence": {
        "iridescenceFactor": 1,
        "iridescenceIor": 1.8,
        "iridescenceThicknessMinimum": 150,
        "iridescenceThicknessMaximum": 480
      }
    },
    "baselineName": "Iridescence / 薄膜金属（比較）",
    "baselineExtensions": {},
    "patch": {
      "baseColorTextureId": "texture-catalog-brushed-color-197e140e4335",
      "normalTexture": {
        "textureAssetId": "texture-catalog-brushed-normal-c83f7f1c3042",
        "texCoord": 0,
        "scale": 0.5
      },
      "metallicRoughnessTextureId": "texture-catalog-brushed-orm-e7082bca35b1",
      "occlusionTextureId": "texture-catalog-brushed-orm-e7082bca35b1"
    },
    "sampleModel": "catalog-knob",
    "group": "Iridescence",
    "description": "見る角度による色の変化を、表面の模様と組み合わせます。",
    "note": "角度による反射色の変化を比べます。厚みテクスチャのない面ではThickness Maximumが使われます。",
    "labels": [
      "Iridescence 1",
      "Iridescence 0"
    ],
    "tags": [
      "薄膜",
      "虹色",
      "テクスチャ"
    ]
  },
  {
    "key": "sheen-denim",
    "name": "Sheen / デニム",
    "extensionLabel": "KHR_materials_sheen",
    "base": {
      "color": "#748cb4",
      "metalness": 0,
      "roughness": 1
    },
    "extensions": {
      "KHR_materials_sheen": {
        "sheenColorFactor": [
          0.42,
          0.57,
          0.81
        ],
        "sheenRoughnessFactor": 0.65
      }
    },
    "baselineName": "Sheen / デニム（比較）",
    "baselineExtensions": {},
    "patch": {
      "baseColorTextureId": "texture-catalog-fabric-color-6d8f6579c789",
      "normalTexture": {
        "textureAssetId": "texture-catalog-fabric-normal-acff263eac6e",
        "texCoord": 0,
        "scale": 0.5
      },
      "metallicRoughnessTextureId": "texture-catalog-fabric-orm-c3e0394c8c8f",
      "occlusionTextureId": "texture-catalog-fabric-orm-c3e0394c8c8f",
      "doubleSided": true
    },
    "sampleModel": "catalog-drape",
    "group": "Sheen",
    "description": "折り目と織り目に当たる光で、布の縁の柔らかい光沢を比べます。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Sheen ON",
      "Sheen OFF"
    ],
    "tags": [
      "布",
      "織り目",
      "テクスチャ"
    ]
  },
  {
    "key": "sheen-satin",
    "name": "Sheen / サテン",
    "extensionLabel": "KHR_materials_sheen",
    "base": {
      "color": "#c7a6b3",
      "metalness": 0,
      "roughness": 1
    },
    "extensions": {
      "KHR_materials_sheen": {
        "sheenColorFactor": [
          0.97,
          0.78,
          0.9
        ],
        "sheenRoughnessFactor": 0.2
      }
    },
    "baselineName": "Sheen / サテン（比較）",
    "baselineExtensions": {},
    "patch": {
      "baseColorTextureId": "texture-catalog-fabric-color-6d8f6579c789",
      "normalTexture": {
        "textureAssetId": "texture-catalog-fabric-normal-acff263eac6e",
        "texCoord": 0,
        "scale": 0.5
      },
      "metallicRoughnessTextureId": "texture-catalog-fabric-orm-c3e0394c8c8f",
      "occlusionTextureId": "texture-catalog-fabric-orm-c3e0394c8c8f",
      "doubleSided": true
    },
    "sampleModel": "catalog-drape",
    "group": "Sheen",
    "description": "折り目と織り目に当たる光で、布の縁の柔らかい光沢を比べます。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Sheen ON",
      "Sheen OFF"
    ],
    "tags": [
      "布",
      "織り目",
      "テクスチャ"
    ]
  },
  {
    "key": "sheen-wool",
    "name": "Sheen / ウール",
    "extensionLabel": "KHR_materials_sheen",
    "base": {
      "color": "#bfb9ab",
      "metalness": 0,
      "roughness": 1
    },
    "extensions": {
      "KHR_materials_sheen": {
        "sheenColorFactor": [
          0.9,
          0.86,
          0.75
        ],
        "sheenRoughnessFactor": 0.88
      }
    },
    "baselineName": "Sheen / ウール（比較）",
    "baselineExtensions": {},
    "patch": {
      "baseColorTextureId": "texture-catalog-fabric-color-6d8f6579c789",
      "normalTexture": {
        "textureAssetId": "texture-catalog-fabric-normal-acff263eac6e",
        "texCoord": 0,
        "scale": 0.5
      },
      "metallicRoughnessTextureId": "texture-catalog-fabric-orm-c3e0394c8c8f",
      "occlusionTextureId": "texture-catalog-fabric-orm-c3e0394c8c8f",
      "doubleSided": true
    },
    "sampleModel": "catalog-drape",
    "group": "Sheen",
    "description": "折り目と織り目に当たる光で、布の縁の柔らかい光沢を比べます。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Sheen ON",
      "Sheen OFF"
    ],
    "tags": [
      "布",
      "織り目",
      "テクスチャ"
    ]
  },
  {
    "key": "anisotropy-turning",
    "name": "Anisotropy / 旋盤仕上げ",
    "extensionLabel": "KHR_materials_anisotropy",
    "base": {
      "color": "#ffffff",
      "metalness": 1,
      "roughness": 1
    },
    "extensions": {
      "KHR_materials_anisotropy": {
        "anisotropyStrength": 0.85,
        "anisotropyRotation": 0
      }
    },
    "baselineName": "Anisotropy / 旋盤仕上げ（比較）",
    "baselineExtensions": {},
    "patch": {
      "baseColorTextureId": "texture-catalog-brushed-color-197e140e4335",
      "normalTexture": {
        "textureAssetId": "texture-catalog-brushed-normal-c83f7f1c3042",
        "texCoord": 0,
        "scale": 0.5
      },
      "metallicRoughnessTextureId": "texture-catalog-brushed-orm-e7082bca35b1",
      "occlusionTextureId": "texture-catalog-brushed-orm-e7082bca35b1"
    },
    "sampleModel": "catalog-knob",
    "group": "Anisotropy",
    "description": "UVの方向に沿って伸びる反射を、等方的な反射と比べます。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Anisotropy .85",
      "Anisotropy 0"
    ],
    "tags": [
      "金属",
      "ヘアライン",
      "テクスチャ"
    ]
  },
  {
    "key": "anisotropy-copper",
    "name": "Anisotropy / 銅のヘアライン",
    "extensionLabel": "KHR_materials_anisotropy",
    "base": {
      "color": "#ffffff",
      "metalness": 1,
      "roughness": 1
    },
    "extensions": {
      "KHR_materials_anisotropy": {
        "anisotropyStrength": 0.85,
        "anisotropyRotation": 1.5708
      }
    },
    "baselineName": "Anisotropy / 銅のヘアライン（比較）",
    "baselineExtensions": {},
    "patch": {
      "baseColorTextureId": "texture-catalog-hammered-color-e0e64398951a",
      "normalTexture": {
        "textureAssetId": "texture-catalog-hammered-normal-2f510faa5640",
        "texCoord": 0,
        "scale": 0.5
      },
      "metallicRoughnessTextureId": "texture-catalog-hammered-orm-c253d1b1406e",
      "occlusionTextureId": "texture-catalog-hammered-orm-c253d1b1406e"
    },
    "sampleModel": "catalog-knob",
    "group": "Anisotropy",
    "description": "UVの方向に沿って伸びる反射を、等方的な反射と比べます。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Anisotropy .85",
      "Anisotropy 0"
    ],
    "tags": [
      "金属",
      "ヘアライン",
      "テクスチャ"
    ]
  },
  {
    "key": "emissive-circuit",
    "name": "Emissive / 回路パネル",
    "extensionLabel": "KHR_materials_emissive_strength",
    "base": {
      "color": "#151b25",
      "metalness": 0.2,
      "roughness": 0.55,
      "emissiveFactor": [
        0.08,
        0.8,
        1
      ]
    },
    "extensions": {
      "KHR_materials_emissive_strength": {
        "emissiveStrength": 5
      }
    },
    "baselineName": "Emissive / 回路パネル（比較）",
    "baselineExtensions": {},
    "patch": {
      "emissiveTextureId": "texture-catalog-circuit-emission-8a812080670a"
    },
    "sampleModel": "catalog-tile",
    "group": "Emissive",
    "description": "Emissive Textureの白い部分だけが光ります。模様を保ったまま発光強度を比べます。",
    "note": "発光はEmissive Factor × Emissive Texture × Strengthで決まります。にじみはBloom、周囲を照らす光はLightで別に設定します。",
    "labels": [
      "Strength 5",
      "Strength 1"
    ],
    "tags": [
      "発光",
      "ネオン",
      "Emissive Texture",
      "テクスチャ"
    ]
  },
  {
    "key": "emissive-grid",
    "name": "Emissive / ライトグリッド",
    "extensionLabel": "KHR_materials_emissive_strength",
    "base": {
      "color": "#151b25",
      "metalness": 0.2,
      "roughness": 0.55,
      "emissiveFactor": [
        1,
        0.65,
        0.12
      ]
    },
    "extensions": {
      "KHR_materials_emissive_strength": {
        "emissiveStrength": 4
      }
    },
    "baselineName": "Emissive / ライトグリッド（比較）",
    "baselineExtensions": {},
    "patch": {
      "emissiveTextureId": "texture-catalog-grid-emission-33c114cbc683"
    },
    "sampleModel": "catalog-shaderball",
    "group": "Emissive",
    "description": "Emissive Textureの白い部分だけが光ります。模様を保ったまま発光強度を比べます。",
    "note": "発光はEmissive Factor × Emissive Texture × Strengthで決まります。にじみはBloom、周囲を照らす光はLightで別に設定します。",
    "labels": [
      "Strength 4",
      "Strength 1"
    ],
    "tags": [
      "発光",
      "ネオン",
      "Emissive Texture",
      "テクスチャ"
    ]
  },
  {
    "key": "emissive-lava",
    "name": "Emissive / 溶岩の割れ目",
    "extensionLabel": "KHR_materials_emissive_strength",
    "base": {
      "color": "#151b25",
      "metalness": 0.2,
      "roughness": 0.55,
      "emissiveFactor": [
        1,
        0.17,
        0.015
      ]
    },
    "extensions": {
      "KHR_materials_emissive_strength": {
        "emissiveStrength": 7
      }
    },
    "baselineName": "Emissive / 溶岩の割れ目（比較）",
    "baselineExtensions": {},
    "patch": {
      "emissiveTextureId": "texture-catalog-lava-emission-4dc595741e58"
    },
    "sampleModel": "catalog-shaderball",
    "group": "Emissive",
    "description": "Emissive Textureの白い部分だけが光ります。模様を保ったまま発光強度を比べます。",
    "note": "発光はEmissive Factor × Emissive Texture × Strengthで決まります。にじみはBloom、周囲を照らす光はLightで別に設定します。",
    "labels": [
      "Strength 7",
      "Strength 1"
    ],
    "tags": [
      "発光",
      "ネオン",
      "Emissive Texture",
      "テクスチャ"
    ]
  },
  {
    "key": "emissive-stars",
    "name": "Emissive / 星の陶器",
    "extensionLabel": "KHR_materials_emissive_strength",
    "base": {
      "color": "#151b25",
      "metalness": 0.2,
      "roughness": 0.55,
      "emissiveFactor": [
        0.3,
        0.6,
        1
      ]
    },
    "extensions": {
      "KHR_materials_emissive_strength": {
        "emissiveStrength": 5
      }
    },
    "baselineName": "Emissive / 星の陶器（比較）",
    "baselineExtensions": {},
    "patch": {
      "emissiveTextureId": "texture-catalog-stars-emission-6ced43baff3b"
    },
    "sampleModel": "catalog-vase",
    "group": "Emissive",
    "description": "Emissive Textureの白い部分だけが光ります。模様を保ったまま発光強度を比べます。",
    "note": "発光はEmissive Factor × Emissive Texture × Strengthで決まります。にじみはBloom、周囲を照らす光はLightで別に設定します。",
    "labels": [
      "Strength 5",
      "Strength 1"
    ],
    "tags": [
      "発光",
      "ネオン",
      "Emissive Texture",
      "テクスチャ"
    ]
  },
  {
    "key": "emissive-rings",
    "name": "Emissive / 同心円サイン",
    "extensionLabel": "KHR_materials_emissive_strength",
    "base": {
      "color": "#151b25",
      "metalness": 0.2,
      "roughness": 0.55,
      "emissiveFactor": [
        1,
        0.12,
        0.45
      ]
    },
    "extensions": {
      "KHR_materials_emissive_strength": {
        "emissiveStrength": 4
      }
    },
    "baselineName": "Emissive / 同心円サイン（比較）",
    "baselineExtensions": {},
    "patch": {
      "emissiveTextureId": "texture-catalog-rings-emission-ce74ae0a2fc2"
    },
    "sampleModel": "catalog-tile",
    "group": "Emissive",
    "description": "Emissive Textureの白い部分だけが光ります。模様を保ったまま発光強度を比べます。",
    "note": "発光はEmissive Factor × Emissive Texture × Strengthで決まります。にじみはBloom、周囲を照らす光はLightで別に設定します。",
    "labels": [
      "Strength 4",
      "Strength 1"
    ],
    "tags": [
      "発光",
      "ネオン",
      "Emissive Texture",
      "テクスチャ"
    ]
  },
  {
    "key": "emissive-pixels",
    "name": "Emissive / ドット表示",
    "extensionLabel": "KHR_materials_emissive_strength",
    "base": {
      "color": "#151b25",
      "metalness": 0.2,
      "roughness": 0.55,
      "emissiveFactor": [
        0.2,
        1,
        0.35
      ]
    },
    "extensions": {
      "KHR_materials_emissive_strength": {
        "emissiveStrength": 6
      }
    },
    "baselineName": "Emissive / ドット表示（比較）",
    "baselineExtensions": {},
    "patch": {
      "emissiveTextureId": "texture-catalog-pixels-emission-d9251c5e58b3"
    },
    "sampleModel": "catalog-tile",
    "group": "Emissive",
    "description": "Emissive Textureの白い部分だけが光ります。模様を保ったまま発光強度を比べます。",
    "note": "発光はEmissive Factor × Emissive Texture × Strengthで決まります。にじみはBloom、周囲を照らす光はLightで別に設定します。",
    "labels": [
      "Strength 6",
      "Strength 1"
    ],
    "tags": [
      "発光",
      "ネオン",
      "Emissive Texture",
      "テクスチャ"
    ]
  },
  {
    "key": "pbr-wood",
    "name": "PBR / 木目の凹凸",
    "extensionLabel": "glTF 2.0",
    "base": {
      "color": "#ffffff",
      "metalness": 0,
      "roughness": 1
    },
    "extensions": {},
    "baselineName": "PBR / 木目の凹凸（比較）",
    "baselineExtensions": {},
    "patch": {
      "baseColorTextureId": "texture-catalog-wood-color-ca0256698184",
      "normalTexture": {
        "textureAssetId": "texture-catalog-wood-normal-d0e385fcf1ed",
        "texCoord": 0,
        "scale": 0.5
      },
      "metallicRoughnessTextureId": "texture-catalog-wood-orm-f4abb7ebed61",
      "occlusionTextureId": "texture-catalog-wood-orm-f4abb7ebed61"
    },
    "sampleModel": "catalog-vase",
    "group": "テクスチャ / PBR",
    "description": "画像・凹凸・粗さ・金属度を役割別に設定する、テクスチャ付きの比較見本です。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Normal Map ON",
      "Normal Map OFF"
    ],
    "tags": [
      "PBR",
      "テクスチャ",
      "Normal Map"
    ],
    "baselinePatch": {
      "normalTexture": null
    },
    "comparisonProperty": true
  },
  {
    "key": "pbr-marble",
    "name": "PBR / 大理石",
    "extensionLabel": "glTF 2.0",
    "base": {
      "color": "#ffffff",
      "metalness": 0,
      "roughness": 1
    },
    "extensions": {},
    "baselineName": "PBR / 大理石（比較）",
    "baselineExtensions": {},
    "patch": {
      "baseColorTextureId": "texture-catalog-marble-color-9be4bc687b2b",
      "normalTexture": {
        "textureAssetId": "texture-catalog-marble-normal-11b2d6635f1a",
        "texCoord": 0,
        "scale": 0.5
      },
      "metallicRoughnessTextureId": "texture-catalog-marble-orm-6c48aace6df0",
      "occlusionTextureId": "texture-catalog-marble-orm-6c48aace6df0"
    },
    "sampleModel": "catalog-shaderball",
    "group": "テクスチャ / PBR",
    "description": "画像・凹凸・粗さ・金属度を役割別に設定する、テクスチャ付きの比較見本です。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Normal Map ON",
      "Normal Map OFF"
    ],
    "tags": [
      "PBR",
      "テクスチャ",
      "Normal Map"
    ],
    "baselinePatch": {
      "normalTexture": null
    },
    "comparisonProperty": true
  },
  {
    "key": "pbr-concrete",
    "name": "PBR / コンクリート",
    "extensionLabel": "glTF 2.0",
    "base": {
      "color": "#ffffff",
      "metalness": 0,
      "roughness": 1
    },
    "extensions": {},
    "baselineName": "PBR / コンクリート（比較）",
    "baselineExtensions": {},
    "patch": {
      "baseColorTextureId": "texture-catalog-concrete-color-d29c63643331",
      "normalTexture": {
        "textureAssetId": "texture-catalog-concrete-normal-99c66b9ad684",
        "texCoord": 0,
        "scale": 0.5
      },
      "metallicRoughnessTextureId": "texture-catalog-concrete-orm-afcb9f3989b6",
      "occlusionTextureId": "texture-catalog-concrete-orm-afcb9f3989b6"
    },
    "sampleModel": "catalog-tile",
    "group": "テクスチャ / PBR",
    "description": "画像・凹凸・粗さ・金属度を役割別に設定する、テクスチャ付きの比較見本です。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Normal Map ON",
      "Normal Map OFF"
    ],
    "tags": [
      "PBR",
      "テクスチャ",
      "Normal Map"
    ],
    "baselinePatch": {
      "normalTexture": null
    },
    "comparisonProperty": true
  },
  {
    "key": "pbr-brick",
    "name": "PBR / レンガの目地",
    "extensionLabel": "glTF 2.0",
    "base": {
      "color": "#ffffff",
      "metalness": 0,
      "roughness": 1
    },
    "extensions": {},
    "baselineName": "PBR / レンガの目地（比較）",
    "baselineExtensions": {},
    "patch": {
      "baseColorTextureId": "texture-catalog-brick-color-3ee46da4b6cd",
      "normalTexture": {
        "textureAssetId": "texture-catalog-brick-normal-3d6af27e609e",
        "texCoord": 0,
        "scale": 0.5
      },
      "metallicRoughnessTextureId": "texture-catalog-brick-orm-b008b62c3e11",
      "occlusionTextureId": "texture-catalog-brick-orm-b008b62c3e11"
    },
    "sampleModel": "catalog-tile",
    "group": "テクスチャ / PBR",
    "description": "画像・凹凸・粗さ・金属度を役割別に設定する、テクスチャ付きの比較見本です。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Normal Map ON",
      "Normal Map OFF"
    ],
    "tags": [
      "PBR",
      "テクスチャ",
      "Normal Map"
    ],
    "baselinePatch": {
      "normalTexture": null
    },
    "comparisonProperty": true
  },
  {
    "key": "pbr-leather",
    "name": "PBR / レザー",
    "extensionLabel": "glTF 2.0",
    "base": {
      "color": "#ffffff",
      "metalness": 0,
      "roughness": 1
    },
    "extensions": {},
    "baselineName": "PBR / レザー（比較）",
    "baselineExtensions": {},
    "patch": {
      "baseColorTextureId": "texture-catalog-leather-color-539ab69276f4",
      "normalTexture": {
        "textureAssetId": "texture-catalog-leather-normal-9a69afd13940",
        "texCoord": 0,
        "scale": 0.5
      },
      "metallicRoughnessTextureId": "texture-catalog-leather-orm-b380949fd111",
      "occlusionTextureId": "texture-catalog-leather-orm-b380949fd111",
      "doubleSided": true
    },
    "sampleModel": "catalog-drape",
    "group": "テクスチャ / PBR",
    "description": "画像・凹凸・粗さ・金属度を役割別に設定する、テクスチャ付きの比較見本です。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Normal Map ON",
      "Normal Map OFF"
    ],
    "tags": [
      "PBR",
      "テクスチャ",
      "Normal Map"
    ],
    "baselinePatch": {
      "normalTexture": null
    },
    "comparisonProperty": true
  },
  {
    "key": "pbr-ceramic",
    "name": "PBR / タイルの目地",
    "extensionLabel": "glTF 2.0",
    "base": {
      "color": "#ffffff",
      "metalness": 0,
      "roughness": 1
    },
    "extensions": {},
    "baselineName": "PBR / タイルの目地（比較）",
    "baselineExtensions": {},
    "patch": {
      "baseColorTextureId": "texture-catalog-ceramic-color-b518fe66a374",
      "normalTexture": {
        "textureAssetId": "texture-catalog-ceramic-normal-2c8b19249db5",
        "texCoord": 0,
        "scale": 0.5
      },
      "metallicRoughnessTextureId": "texture-catalog-ceramic-orm-f77805a3cd4f",
      "occlusionTextureId": "texture-catalog-ceramic-orm-f77805a3cd4f"
    },
    "sampleModel": "catalog-tile",
    "group": "テクスチャ / PBR",
    "description": "画像・凹凸・粗さ・金属度を役割別に設定する、テクスチャ付きの比較見本です。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Normal Map ON",
      "Normal Map OFF"
    ],
    "tags": [
      "PBR",
      "テクスチャ",
      "Normal Map"
    ],
    "baselinePatch": {
      "normalTexture": null
    },
    "comparisonProperty": true
  },
  {
    "key": "pbr-rust",
    "name": "PBR / 錆と金属",
    "extensionLabel": "glTF 2.0",
    "base": {
      "color": "#ffffff",
      "metalness": 1,
      "roughness": 1
    },
    "extensions": {},
    "baselineName": "PBR / 錆と金属（比較）",
    "baselineExtensions": {},
    "patch": {
      "baseColorTextureId": "texture-catalog-rust-color-d50dec675e4d",
      "normalTexture": {
        "textureAssetId": "texture-catalog-rust-normal-eb15404593d4",
        "texCoord": 0,
        "scale": 0.5
      },
      "metallicRoughnessTextureId": "texture-catalog-rust-orm-2c1f76d64544",
      "occlusionTextureId": "texture-catalog-rust-orm-2c1f76d64544"
    },
    "sampleModel": "catalog-knob",
    "group": "テクスチャ / PBR",
    "description": "画像・凹凸・粗さ・金属度を役割別に設定する、テクスチャ付きの比較見本です。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "ORM Map ON",
      "ORM Map OFF"
    ],
    "tags": [
      "PBR",
      "テクスチャ",
      "orm"
    ],
    "baselinePatch": {
      "metallicRoughnessTextureId": null
    },
    "comparisonProperty": true
  },
  {
    "key": "pbr-uv",
    "name": "Texture Transform / 繰り返し",
    "extensionLabel": "glTF 2.0",
    "base": {
      "color": "#ffffff",
      "metalness": 0,
      "roughness": 1
    },
    "extensions": {},
    "baselineName": "Texture Transform / 繰り返し（比較）",
    "baselineExtensions": {},
    "patch": {
      "pbrMetallicRoughness": {
        "baseColorTexture": {
          "textureAssetId": "texture-catalog-ceramic-color-b518fe66a374",
          "texCoord": 0,
          "transform": {
            "offset": [
              0,
              0
            ],
            "rotation": 0,
            "scale": [
              3,
              3
            ]
          }
        }
      }
    },
    "sampleModel": "catalog-tile",
    "group": "テクスチャ / PBR",
    "description": "画像・凹凸・粗さ・金属度を役割別に設定する、テクスチャ付きの比較見本です。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "UV 3 × 3",
      "UV 1 × 1"
    ],
    "tags": [
      "PBR",
      "テクスチャ",
      "uv"
    ],
    "baselinePatch": {
      "pbrMetallicRoughness": {
        "baseColorTexture": {
          "textureAssetId": "texture-catalog-ceramic-color-b518fe66a374",
          "texCoord": 0
        }
      }
    },
    "comparisonProperty": true
  },
  {
    "key": "pbr-cutout",
    "name": "Alpha Mask / 金属グリル",
    "extensionLabel": "glTF 2.0",
    "base": {
      "color": "#ffffff",
      "metalness": 1,
      "roughness": 0.3
    },
    "extensions": {},
    "baselineName": "Alpha Mask / 金属グリル（比較）",
    "baselineExtensions": {},
    "patch": {
      "baseColorTextureId": "texture-catalog-grille-color-83d53b4e1e3e",
      "alphaMode": "MASK",
      "alphaCutoff": 0.5,
      "doubleSided": true
    },
    "sampleModel": "catalog-tile",
    "group": "テクスチャ / PBR",
    "description": "画像・凹凸・粗さ・金属度を役割別に設定する、テクスチャ付きの比較見本です。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Alpha MASK",
      "Alpha OPAQUE"
    ],
    "tags": [
      "PBR",
      "テクスチャ",
      "alpha"
    ],
    "baselinePatch": {
      "alphaMode": "OPAQUE"
    },
    "comparisonProperty": true
  },
  {
    "key": "unlit-pattern",
    "name": "Unlit / 模様のある案内板",
    "extensionLabel": "KHR_materials_unlit",
    "base": {
      "color": "#ffffff",
      "metalness": 0,
      "roughness": 1
    },
    "extensions": {
      "KHR_materials_unlit": {}
    },
    "baselineName": "Unlit / 模様のある案内板（比較）",
    "baselineExtensions": {},
    "patch": {
      "baseColorTextureId": "texture-catalog-ceramic-color-b518fe66a374"
    },
    "sampleModel": "catalog-tile",
    "group": "Unlit",
    "description": "同じテクスチャで、照明を受ける表示と受けない表示を比べます。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Unlit",
      "Lit"
    ],
    "tags": [
      "案内板",
      "テクスチャ"
    ]
  },
  {
    "key": "specular-leather",
    "name": "Specular / オイルレザー",
    "extensionLabel": "KHR_materials_specular",
    "base": {
      "color": "#ffffff",
      "metalness": 0,
      "roughness": 0.65
    },
    "extensions": {
      "KHR_materials_specular": {
        "specularFactor": 0.18,
        "specularColorFactor": [
          1,
          1,
          1
        ]
      }
    },
    "baselineName": "Specular / オイルレザー（比較）",
    "baselineExtensions": {},
    "patch": {
      "baseColorTextureId": "texture-catalog-leather-color-539ab69276f4",
      "normalTexture": {
        "textureAssetId": "texture-catalog-leather-normal-9a69afd13940",
        "texCoord": 0,
        "scale": 0.5
      },
      "metallicRoughnessTextureId": "texture-catalog-leather-orm-b380949fd111",
      "occlusionTextureId": "texture-catalog-leather-orm-b380949fd111",
      "doubleSided": true
    },
    "sampleModel": "catalog-drape",
    "group": "Specular",
    "description": "レザーの凹凸を残し、非金属の反射を抑えた表面と比べます。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "Specular .18",
      "Specular 1"
    ],
    "tags": [
      "革",
      "反射",
      "テクスチャ"
    ]
  },
  {
    "key": "ior-liquid",
    "name": "IOR / 液体の屈折",
    "extensionLabel": "KHR_materials_ior",
    "base": {
      "color": "#ffffff",
      "metalness": 0,
      "roughness": 0.025
    },
    "extensions": {
      "KHR_materials_transmission": {
        "transmissionFactor": 1
      },
      "KHR_materials_ior": {
        "ior": 1.33
      },
      "KHR_materials_volume": {
        "thicknessFactor": 0.3,
        "attenuationColor": [
          1,
          1,
          1
        ],
        "attenuationDistance": 0.4
      }
    },
    "baselineName": "IOR / 液体の屈折（比較）",
    "baselineExtensions": {
      "KHR_materials_transmission": {
        "transmissionFactor": 1
      },
      "KHR_materials_volume": {
        "thicknessFactor": 0.3,
        "attenuationColor": [
          1,
          1,
          1
        ],
        "attenuationDistance": 0.4
      }
    },
    "patch": {},
    "sampleModel": "catalog-vase",
    "group": "IOR",
    "description": "同じ器の形状で、屈折率を1.33と1.5にした違いを比べます。",
    "note": "左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。",
    "labels": [
      "IOR 1.33",
      "IOR 1.5"
    ],
    "tags": [
      "屈折率",
      "水"
    ]
  }
];
