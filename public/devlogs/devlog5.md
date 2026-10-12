### **Deadpaw: the Deadlock fork**

`October 12th, 2026`

#### **What changed** 💡

**Deadpaw** is a fork of **[pawverwatch](https://github.com/ThaiDuongVu/pawverwatch)** by [@wingnight_ow](https://www.tiktok.com/@wingnight_ow) that swaps the Overwatch roster for **Deadlock**. The editor itself (background removal, layers, favorites, export) is unchanged.

- All 41 playable heroes, each with portrait cards, a head sticker, their four ability badges and their name plate
- Hero and city backgrounds in place of Overwatch maps

#### **Implementation** 💻

Hero art comes from the community **[Deadlock API](https://deadlock-api.com)**. `scripts/fetch-deadlock-assets.py` downloads it and rebuilds `public/data/heroes.json` and `public/data/modes.json`, so adding a newly released hero is a matter of re-running the script.

The earlier entries below are the original pawverwatch dev logs.
