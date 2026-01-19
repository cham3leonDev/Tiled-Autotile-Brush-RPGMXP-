# How To Use
First of all you need to convert your autotile into a 48-tiles tileset by using my RPG Maker XP Autotile Converter https://github.com/cham3leonDev/RPGMXPAutotilesToTMXSet

Then: Click on the green "Code" and download the Zip. Unzip it and put the .js file into your user/AppData/Local/Tiled/extensions folder.
Restart or Start Tiled and choose a tileset and a tile. At the bottom you will see "Edit Tileset" with a wrench symbol. Click on it and the Editing System opens.
Now click on a tile that you want to use as the Autotile and select Tileset>RMXP: Assign Autotile Source. Find a 48-tiles tileset as .tsx file (like described and shown in the Autotile Converter).
Choose it and keep the Start ID at 0. Save the tileset by clicking on File>Save. Go back to your map, select the tile you just assigned the Autotile function to and select the RMXP Autotile Brush at the top.
Before starting to paint, u need to create a new empty layer, preferably between layer 1 and layer 2. 
Name it something like "Autotiles" (if you don't do this, the autotile will conflict with other layers and causes layer 1 to only give you a 3x3 black output).
Select the layer and start placing your tiles. Once placed you need to click on the tile again to convert it into an autotile that connects with the other ones.
Sometimes you need to click again in-between tiles to connect them.

# Note
It's important to remember which tile you assigned the autotile function to.

Personally I would place a symbol into the tile right next to it, to symbolize that it's an autotile.
