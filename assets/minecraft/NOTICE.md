# Minecraft original assets — unofficial prototype

Minecraft Java Edition 1.21.5 textures.
Copyright Mojang / Microsoft.

These are proprietary original game textures. They are not open source,
not MIT licensed, and not licensed under Creative Commons BY-SA.

The PNG files were extracted byte-for-byte from Mojang's official client JAR
after its SHA-1 was verified against the official version metadata.
Local filenames were shortened; sources.json records every original entry,
download URL, version, dimensions, and file checksum.

The workbench extension also uses the original enchanting-table faces,
enchanting-book atlas, anvil surfaces, bookshelf, and inventory item textures.
Its table/anvil cuboid proportions were checked against the corresponding
official block model JSON files in the same verified client JAR. The floating
book mesh and scene animations are implemented by this project. The original
textures and referenced block designs remain Mojang / Microsoft assets;
this addition does not give them an open-source license.

The Nether/End expansion adds original illager, vex, witch, piglin, magma cube,
ghast, drowned and husk skins; terrain, portal and lava frame strips; the end
crystal and trident entity atlases; and resource/tool inventory icons. Four
original .png.mcmeta files are retained verbatim under .animation.json names.
Every added file comes from the same SHA-1-verified Java 1.21.5 client JAR and
has an extraction SHA-256 in sources.json. These assets remain proprietary.
The additional cuboid rigs, held-tool geometry and animations are implemented
in src/realm-models.js by this project; no Minecraft executable code is used.

The slime block and slime ball inventory textures were extracted unchanged
from the same verified Java 1.21.5 client JAR on 2026-11-14. Their original
transparency is preserved. They have the same proprietary ownership described
above; sources.json records their original paths and individual SHA-256 values.

This extraction was prepared for this unofficial browser prototype at the user's request.
Publishing the project does not relicense these textures or imply endorsement.
The GitHub Pages demo is separate from Bilibili Toy; no Toy upload or review has been performed.

Official EULA: https://www.minecraft.net/en-us/eula
Official usage guidelines: https://www.minecraft.net/en-us/usage-guidelines

Minecraft 原版纹理 © Mojang / Microsoft。
非官方网页原型，与 Mojang 或 Microsoft 无关联，未获其认可。
