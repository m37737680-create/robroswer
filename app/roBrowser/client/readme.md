Setup the remote client
=======================

The remote client exist to help users without a FullClient on their computer to play by downloading resources from an external server.
Because pushing directly the fullclient on a server/ftp can provoke some errors, this tool allow to :

 - Get the files from a client used in another domain (Cross-origin resource sharing).
 - Extracting unencrypted files directly from GRF archives (versions 0x200 and 0x300).
 - Converting BMP files to PNG to speed up the transfer.
 - Optimized to don't call any script if files are already extracted/converted (resource friendly).

###Add your fullclient###

Just put your GRF files and `DATA.INI` in the `resources/` directory.
With auto-extract enabled, requested files are cached under their original paths (such as `data/` or `System/`); the full folders do not need to be extracted in advance. Keep the GRFs listed in `DATA.INI` available.

Existing local files take precedence and are not refreshed from a GRF. Remove only a local file that you want the client to fetch again.

**Note: to be sure to use a compatible version of your GRFs, download *GRF Builder* and repack them manually (Option > Repack type > Decrypt -> Repack), it will ensure the GRFs files are converted in the proper version**

Entries encrypted with DES are not extracted by the remote client; repack those archives without encryption first.

-----------------

###Configure the remote client###

Open *configs.php* file and complete it

----------------

###Configure the rewrite rule###

Open *".htaccess"* file, you will have some example on how to modify the rewrite rule to match your url location :

    #ex : myroserver.com/client/
    ErrorDocument 404 /client/index.php

    #ex : myroserver.com/low/client/
    ErrorDocument 404 /low/client/index.php

    #ex : client.myroserver.com/
    ErrorDocument 404 /index.php