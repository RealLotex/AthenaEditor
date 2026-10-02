# Bundled AthenaEnv player

The athena.elf in this directory is the official `latest` development release,
verified and updated on 2026-10-02. The editor's Run launcher uses this player by
default. AthenaEnv is by Daniel Santos:
[upstream source and releases](https://github.com/DanielSant0s/AthenaEnv).
Its MIT license is preserved in LICENSE here. PCSX2 and BIOS files are not bundled.

Release: [latest, published 2026-08-01](https://github.com/DanielSant0s/AthenaEnv/releases/tag/latest)

- Release ID: `363587511`; upstream commit: `359485433f63c3b2f606a535f13aae1fdbfdb956`.
- Official asset: `AthenaEnv.tar.gz`, 13,620,357 bytes.
- Asset SHA-256 (checked against GitHub's published digest):
  `fdcd196b841cd22d6edc61a96dc8d4ecd02c2bdd1a6504fae0fa22a4f353841a`.
- Extracted player: 5,464,308 bytes; SHA-256:
  `a5c56a648ed4188d6bc9fd4c9090ad61a5f26c08603a30d94652eacf288fff84`.

The tag is mutable; these hashes identify the exact player tested here. The
previous bundled player was `a967f8ed3ed8fca585256eacd5f2cce6d8ea74d1d94e941b61a1bfcdbdbb1dfd`.
athena.ini keeps the editor's configuration: skip the boot logo and load main.js.
Selecting a custom runtime in Run settings overrides this bundled player.

Engine bindings documented in docs/ATHENAENV-API.md were inspected in a local source
checkout at reference/AthenaEnvSourceFiles. For further engine audits, obtain the
upstream checkout separately. The editor build/tests do not require that checkout.
