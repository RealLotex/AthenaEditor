# Bundled AthenaEnv player

The athena.elf and athena.ini in this directory are the existing player used by the
editor's Run launcher and the verified PCSX2 fixtures. AthenaEnv is by Daniel Santos:
[upstream source and releases](https://github.com/DanielSant0s/AthenaEnv).
Its MIT license is preserved in LICENSE here. PCSX2 and BIOS files are not bundled.

Player SHA-256:
`a967f8ed3ed8fca585256eacd5f2cce6d8ea74d1d94e941b61a1bfcdbdbb1dfd`

Engine bindings documented in docs/ATHENAENV-API.md were inspected in a local source
checkout at reference/AthenaEnvSourceFiles. For further engine audits, obtain the
upstream checkout separately. The editor build/tests do not require that checkout.
