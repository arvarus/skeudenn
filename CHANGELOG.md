# Changelog

All notable changes to this project are documented here. This file is maintained by [release-please](https://github.com/googleapis/release-please) from the [Conventional Commits](https://www.conventionalcommits.org/) merged into `master`: don't edit released entries by hand. New versions are inserted above the previous ones.

## [0.24.1](https://github.com/arvarus/skeudenn/compare/v0.24.0...v0.24.1) (2026-11-07)


### Bug Fixes

* **library:** keep one entry per file when two folder ids share a path ([#292](https://github.com/arvarus/skeudenn/issues/292)) ([0038da4](https://github.com/arvarus/skeudenn/commit/0038da433eae7f86eb4fb3b72fee065a25f903de))

## [0.24.0](https://github.com/arvarus/skeudenn/compare/v0.23.0...v0.24.0) (2026-11-05)


### Features

* **cleanup:** unfold each kind of file to see the books and files behind it ([#289](https://github.com/arvarus/skeudenn/issues/289)) ([649e602](https://github.com/arvarus/skeudenn/commit/649e602e7c336ee0c9dbe51932d427d5899855b2))
* **library:** list the files not imported after adding a folder ([#288](https://github.com/arvarus/skeudenn/issues/288)) ([dbc76b4](https://github.com/arvarus/skeudenn/commit/dbc76b42214ff332ce7193e2caeed7bae7d4b7f0))


### Bug Fixes

* **app:** honour --user-data-dir so the e2e tests use their own data ([#290](https://github.com/arvarus/skeudenn/issues/290)) ([34d070c](https://github.com/arvarus/skeudenn/commit/34d070c6f8e46a533fecbccb30109c6290a2806d))

## [0.23.0](https://github.com/arvarus/skeudenn/compare/v0.22.1...v0.23.0) (2026-11-04)


### Features

* **reader:** add actual size to the continuous reader's width choices ([#284](https://github.com/arvarus/skeudenn/issues/284)) ([6abce4d](https://github.com/arvarus/skeudenn/commit/6abce4d3b7afd2466e9848a608286804a93b9828))
* **stats:** merge the three charts into one grouped bar chart ([#285](https://github.com/arvarus/skeudenn/issues/285)) ([a43a5e4](https://github.com/arvarus/skeudenn/commit/a43a5e4c2d772ffc97aab451af4b917842cb8d0f))


### Bug Fixes

* **library:** park removed books in .deletedByTankobon ([#286](https://github.com/arvarus/skeudenn/issues/286)) ([78e3a4e](https://github.com/arvarus/skeudenn/commit/78e3a4e7502e39fcc567646168fb28f8ddafda9a))

## [0.22.1](https://github.com/arvarus/skeudenn/compare/v0.22.0...v0.22.1) (2026-11-01)


### Bug Fixes

* **docs:** point the Pages base and repository links to the skeudenn repository ([#282](https://github.com/arvarus/skeudenn/issues/282)) ([31dc9f1](https://github.com/arvarus/skeudenn/commit/31dc9f17127084b4d4a5c49a7e36799afacaae43))

## [0.22.0](https://github.com/arvarus/tankobon/compare/v0.21.0...v0.22.0) (2026-11-01)


### Features

* **app:** rename the app to Skeudenn ([#280](https://github.com/arvarus/tankobon/issues/280)) ([66161ae](https://github.com/arvarus/tankobon/commit/66161ae137f8ee15715f65645f9d313eef03a1b2))


### Bug Fixes

* **metadata:** find Bédéthèque series named with a parenthesized qualifier ([#279](https://github.com/arvarus/tankobon/issues/279)) ([5b5d728](https://github.com/arvarus/tankobon/commit/5b5d728d8b071843ba138c6e662f0e8518a9fdff))

## [0.21.0](https://github.com/arvarus/tankobon/compare/v0.20.0...v0.21.0) (2026-10-29)


### Features

* **library:** add a language filter to the toolbar ([#273](https://github.com/arvarus/tankobon/issues/273)) ([e23b5a9](https://github.com/arvarus/tankobon/commit/e23b5a98f044a69e6d4a643ce1b6865943e3ee42))
* **metadata:** keyboard navigation in the lookup dialog ([#277](https://github.com/arvarus/tankobon/issues/277)) ([9aefe18](https://github.com/arvarus/tankobon/commit/9aefe1859916dd6e6661b5ac5131b223bf4b2e66))
* **organization:** empty .deletedByTankobon automatically after a chosen number of days ([#274](https://github.com/arvarus/tankobon/issues/274)) ([a574549](https://github.com/arvarus/tankobon/commit/a5745493788737f563362d9d7cb64e6408f44041))


### Bug Fixes

* **metadata:** keep the lookup dialog open on a click outside ([#275](https://github.com/arvarus/tankobon/issues/275)) ([8953184](https://github.com/arvarus/tankobon/commit/89531845a21dc18036fd5f03129db01be70040ff))
* **metadata:** stop the lookup dialog's scrollbar flickering while searching ([#278](https://github.com/arvarus/tankobon/issues/278)) ([313413a](https://github.com/arvarus/tankobon/commit/313413a77e513c54eca484798cd8b7b031277821))

## [0.20.0](https://github.com/arvarus/tankobon/compare/v0.19.1...v0.20.0) (2026-10-27)


### Features

* **library:** leave out a missing volume from renamed file names ([#265](https://github.com/arvarus/tankobon/issues/265)) ([0d23127](https://github.com/arvarus/tankobon/commit/0d231275349bf7a01e92baf9d92e3f9bed95679d))
* **library:** remove the selected books in one go ([#271](https://github.com/arvarus/tankobon/issues/271)) ([5f939bc](https://github.com/arvarus/tankobon/commit/5f939bcdb0507cad25525af50268843aec404915))
* **lookup:** move the search button to the right ([#267](https://github.com/arvarus/tankobon/issues/267)) ([e2079d1](https://github.com/arvarus/tankobon/commit/e2079d1b410d9851d265a45a66b58d55ba198759))
* **metadata:** add a skip button to move on in a lookup series ([#264](https://github.com/arvarus/tankobon/issues/264)) ([4b5f509](https://github.com/arvarus/tankobon/commit/4b5f509fac35b1b46947884606068fa96fd94d18))
* **organization:** add a volume prefix option to the file name ([#272](https://github.com/arvarus/tankobon/issues/272)) ([21cc5cb](https://github.com/arvarus/tankobon/commit/21cc5cbae86781f43e7aeb491ea65cb8af45f926))
* **settings:** show the .deletedByTankobon size beside the empty action ([#270](https://github.com/arvarus/tankobon/issues/270)) ([55939bf](https://github.com/arvarus/tankobon/commit/55939bfbae917bd285267b330717e3b0546bb064))
* **settings:** show the number of CBR to convert beside the conversion action ([#269](https://github.com/arvarus/tankobon/issues/269)) ([65dec1f](https://github.com/arvarus/tankobon/commit/65dec1fb085434b9e5c046cb9e0c1607ca1e5667))


### Bug Fixes

* **metadata:** make the Bédéthèque lookup find more series ([#268](https://github.com/arvarus/tankobon/issues/268)) ([ad70299](https://github.com/arvarus/tankobon/commit/ad70299e604d9dce0109eca692877be0fddfeb1c))

## [0.19.1](https://github.com/arvarus/tankobon/compare/v0.19.0...v0.19.1) (2026-10-26)


### Bug Fixes

* **data-store:** recharger la bibliothèque si un événement arrive pendant un chargement ([#256](https://github.com/arvarus/tankobon/issues/256)) ([6725c0f](https://github.com/arvarus/tankobon/commit/6725c0ff36f92ec0fc7e5925bb379023a4c512b1))
* **data:** vider la bibliothèque en une seule transaction ([#255](https://github.com/arvarus/tankobon/issues/255)) ([3cb88e7](https://github.com/arvarus/tankobon/commit/3cb88e736a89abd850257929b4de5831484921b8))
* **decoder:** plafonner la taille des CBR et PDF lus en mémoire ([#259](https://github.com/arvarus/tankobon/issues/259)) ([9e47478](https://github.com/arvarus/tankobon/commit/9e47478cf1892e8b45a64c88bd07526ff2dd5874))
* **import:** ne pas restaurer les réglages d'emplacement depuis un export ([#252](https://github.com/arvarus/tankobon/issues/252)) ([b9e6777](https://github.com/arvarus/tankobon/commit/b9e6777c079117733d4fc25c71f748df9ff9713f))
* **library:** accepter plus de 1000 livres dans les actions groupées ([#250](https://github.com/arvarus/tankobon/issues/250)) ([a392413](https://github.com/arvarus/tankobon/commit/a392413bf63b3a8fa4cf6ed9cc8ef49031b409d4))
* **library:** protéger explicitement les livres d'un dossier non relié ([#253](https://github.com/arvarus/tankobon/issues/253)) ([99de282](https://github.com/arvarus/tankobon/commit/99de282272c9d06466d8551ecd861690bb72486a))
* **library:** utiliser le même test de confinement pour la conversion des CBR ([#251](https://github.com/arvarus/tankobon/issues/251)) ([8c68df3](https://github.com/arvarus/tankobon/commit/8c68df3f5a616311d846fa41690811ca6d65dc7f))


### Performance Improvements

* **db:** faire la sauvegarde hors du processus principal ([#260](https://github.com/arvarus/tankobon/issues/260)) ([e7c082e](https://github.com/arvarus/tankobon/commit/e7c082efa5e65a3dfef15a858ae4583206334783))


### Documentation

* **adr:** 0027 recharger la bibliothèque moins souvent et moins cher ([#261](https://github.com/arvarus/tankobon/issues/261)) ([0d608c7](https://github.com/arvarus/tankobon/commit/0d608c76964572aa2e1ffa8319a9e1d77cea7752))
* **adr:** 0028 un second processus décodeur pour le travail d'arrière-plan ([#262](https://github.com/arvarus/tankobon/issues/262)) ([5b3e600](https://github.com/arvarus/tankobon/commit/5b3e600d6367468d2f68f9760e62a2260a85595d))

## [0.19.0](https://github.com/arvarus/tankobon/compare/v0.18.0...v0.19.0) (2026-10-25)


### Features

* **about:** add a link to the Arvarus Discord server ([#246](https://github.com/arvarus/tankobon/issues/246)) ([f85b56e](https://github.com/arvarus/tankobon/commit/f85b56efd6ff40ea6ff232a3cc19f5140826aba7))
* **library:** do not report as duplicates the files with another title or language ([#249](https://github.com/arvarus/tankobon/issues/249)) ([80937c2](https://github.com/arvarus/tankobon/commit/80937c2addce8ae3eb3cc2e3365989bd984918e5))
* **library:** look up the details of the selected books one after the other ([#238](https://github.com/arvarus/tankobon/issues/238)) ([3bf739f](https://github.com/arvarus/tankobon/commit/3bf739fc36899f9d68c41110cb6857de643f956f))
* **library:** select every book of a series from its heading ([#235](https://github.com/arvarus/tankobon/issues/235)) ([4fe405d](https://github.com/arvarus/tankobon/commit/4fe405d9e7e5d27770d71025a40e5924234a6109))
* **metadata:** fold the file name rule block of the lookup dialog ([#248](https://github.com/arvarus/tankobon/issues/248)) ([05f2a6f](https://github.com/arvarus/tankobon/commit/05f2a6fda50e50d405a14f0c81111c80dd16af22))
* **metadata:** forget a previous file name rule from the lookup dialog ([#245](https://github.com/arvarus/tankobon/issues/245)) ([c72264e](https://github.com/arvarus/tankobon/commit/c72264e5689beb683cc5efbcfa9c0b9b8fd6b535))
* **metadata:** option to use the cover found by the lookup ([#241](https://github.com/arvarus/tankobon/issues/241)) ([795691a](https://github.com/arvarus/tankobon/commit/795691a28365e946f395e13a47b10ba564d022e8))
* **metadata:** prefill the last used file name rule in the lookup dialog ([#237](https://github.com/arvarus/tankobon/issues/237)) ([a9e4c1b](https://github.com/arvarus/tankobon/commit/a9e4c1be8140b1589f2a87044e7ac49255c66d7b))
* **metadata:** search the series on Bédéthèque to find the album ([#236](https://github.com/arvarus/tankobon/issues/236)) ([45b9440](https://github.com/arvarus/tankobon/commit/45b9440cdd9315bed38eae32537a8ec38cef6113))
* **metadata:** show the cover of Bédéthèque series-list candidates ([#239](https://github.com/arvarus/tankobon/issues/239)) ([a697371](https://github.com/arvarus/tankobon/commit/a6973717e201e403d046192f8af85de2e40f9273))
* **settings:** add a switch to enable the organized library ([#234](https://github.com/arvarus/tankobon/issues/234)) ([5958097](https://github.com/arvarus/tankobon/commit/59580977f67bae79ed20e62f0d57cd7119e52cf9))
* **settings:** make metadata sources and API keys per user ([#233](https://github.com/arvarus/tankobon/issues/233)) ([24383a9](https://github.com/arvarus/tankobon/commit/24383a9290c4a53d0c5113e2160481eafa92c7f9))
* **settings:** name the section in the settings page title ([#231](https://github.com/arvarus/tankobon/issues/231)) ([24ba0cf](https://github.com/arvarus/tankobon/commit/24ba0cf11f6617465ad2b11202604e3f91c74990))


### Bug Fixes

* **layout:** scroll to the top when changing page ([#243](https://github.com/arvarus/tankobon/issues/243)) ([f4a5714](https://github.com/arvarus/tankobon/commit/f4a5714838c519dac5291d08d1c4f6076169193f))
* **library:** clear the selection once a bulk action is done ([#240](https://github.com/arvarus/tankobon/issues/240)) ([7a45e29](https://github.com/arvarus/tankobon/commit/7a45e2940a243d3b3531db2deef80d351f1b2adb))
* **metadata:** find a one-shot on Bédéthèque from its series page ([#247](https://github.com/arvarus/tankobon/issues/247)) ([8458aab](https://github.com/arvarus/tankobon/commit/8458aabfd212ee5aa94db595b4250bd901690171))
* **metadata:** offer the file name rule for books that already have information ([#244](https://github.com/arvarus/tankobon/issues/244)) ([f53cb10](https://github.com/arvarus/tankobon/commit/f53cb10564f28c80067db42892d5a2f41afec0e9))
* **reader:** return to the library when a book opened from it is closed ([#242](https://github.com/arvarus/tankobon/issues/242)) ([bc2edb4](https://github.com/arvarus/tankobon/commit/bc2edb412e159594d5f616ce143c21d86925f378))

## [0.18.0](https://github.com/arvarus/tankobon/compare/v0.17.0...v0.18.0) (2026-10-24)


### Features

* **data:** add an action to clear the cache ([#227](https://github.com/arvarus/tankobon/issues/227)) ([fe8bbdd](https://github.com/arvarus/tankobon/commit/fe8bbdd31884df2ef120b172d4ff4d3aa0353ee9))
* **home:** welcome title, shuffle icons on every block and reset from continue reading ([#224](https://github.com/arvarus/tankobon/issues/224)) ([ad79bc3](https://github.com/arvarus/tankobon/commit/ad79bc38e0f74381b6178e4973be0dc4d93ca6f7))
* **settings:** disable the statistics and achievements pages ([#222](https://github.com/arvarus/tankobon/issues/222)) ([29f0160](https://github.com/arvarus/tankobon/commit/29f0160bd5e6ebf15d25f2a541199e190998c980))
* **settings:** move home toggle to display, add per-block info tips ([#225](https://github.com/arvarus/tankobon/issues/225)) ([b8cd0a4](https://github.com/arvarus/tankobon/commit/b8cd0a4fd9fca3a142cb8d4a8cf84b458cf8b80c))

## [0.17.0](https://github.com/arvarus/tankobon/compare/v0.16.0...v0.17.0) (2026-10-22)


### Features

* **home:** raise the maximum number of books per block to 30 ([#217](https://github.com/arvarus/tankobon/issues/217)) ([ad6c096](https://github.com/arvarus/tankobon/commit/ad6c096a6309326fc3f4cbfb1238d40820185637))
* **library:** convert the CBR of the organized folder to CBZ ([#218](https://github.com/arvarus/tankobon/issues/218)) ([3b99b99](https://github.com/arvarus/tankobon/commit/3b99b995f0c211bed5c69150f467738b7e24c53a))
* **organization:** move orphan folders to .deletedByTankobon ([#221](https://github.com/arvarus/tankobon/issues/221)) ([2834b4a](https://github.com/arvarus/tankobon/commit/2834b4a3619f618552f327b4064c0b7c331a171e))
* **stats:** add a chart of the number of books in the library ([#213](https://github.com/arvarus/tankobon/issues/213)) ([e1eee96](https://github.com/arvarus/tankobon/commit/e1eee96e617960af52ad55dc09fa394f2835071a))
* **stats:** add a weekly view to the statistics charts ([#216](https://github.com/arvarus/tankobon/issues/216)) ([4c86739](https://github.com/arvarus/tankobon/commit/4c867397609feaf1373dce9968befc30c3a626b0))

## [0.16.0](https://github.com/pprb/tankobon/compare/v0.15.0...v0.16.0) (2026-10-21)


### Features

* **data:** configurable database file name ([#206](https://github.com/pprb/tankobon/issues/206)) ([ce2013b](https://github.com/pprb/tankobon/commit/ce2013bf3af21646526c81ec00ddd42d17aca3dc))
* **data:** automatic database backups and restore ([#203](https://github.com/pprb/tankobon/issues/203)) ([080d177](https://github.com/pprb/tankobon/commit/080d17742963e5c2e6b38b9bbb3f88467b85e2c8))
* **library:** show the book name instead of its path on hover ([#210](https://github.com/pprb/tankobon/issues/210)) ([c22ed4c](https://github.com/pprb/tankobon/commit/c22ed4c7fb27ecd60379673f43c0d88a4480ff7b))
* **library:** cancel the cover requests of rows that left the screen ([#182](https://github.com/pprb/tankobon/issues/182)) ([794a9e3](https://github.com/pprb/tankobon/commit/794a9e3d170d96a754cd4891d846ace125515dfc))
* **library:** change a book's cover from its edit dialog ([#205](https://github.com/pprb/tankobon/issues/205)) ([d732ef1](https://github.com/pprb/tankobon/commit/d732ef1f0c57baee24e8a04a4b8cf5f9351dc180))
* **library:** edit several books at once ([#202](https://github.com/pprb/tankobon/issues/202)) ([6fe0520](https://github.com/pprb/tankobon/commit/6fe05204752bf309540567e7b15124d6600de9e7))
* **organization:** move book cleaning into the organization settings ([#209](https://github.com/pprb/tankobon/issues/209)) ([f5b0b88](https://github.com/pprb/tankobon/commit/f5b0b88a8f9b1b0c205897d60c6e33b2c2f936f4))
* **organization:** option to ignore leading articles in names ([#207](https://github.com/pprb/tankobon/issues/207)) ([f914281](https://github.com/pprb/tankobon/commit/f914281d431e247398be1589c4f6cf06644a19dc))
* **organization:** zero-pad the volume in file names ([#208](https://github.com/pprb/tankobon/issues/208)) ([841413e](https://github.com/pprb/tankobon/commit/841413e5eee5070f9795cd4b6e5635d5db9209c4))


### Bug Fixes

* **archive:** bound the bytes actually inflated from a CBZ entry ([#176](https://github.com/pprb/tankobon/issues/176)) ([cf9ca7d](https://github.com/pprb/tankobon/commit/cf9ca7d8175a1d5af2e51e8b1ab16e5260ae860a))
* **archive:** check BMP and AVIF dimensions, and read a CBR without copying it ([#191](https://github.com/pprb/tankobon/issues/191)) ([c669ffe](https://github.com/pprb/tankobon/commit/c669ffe5806dab42f419af4056b062ccd148376a))
* **archive:** read CBZ entries whose name holds a backslash ([#195](https://github.com/pprb/tankobon/issues/195)) ([0d3130d](https://github.com/pprb/tankobon/commit/0d3130dda25794cd0033e5ad11b3c78d92c405c7))
* **decoder:** bound the queue wait of a scan's cover so inspect keeps its deadline ([#181](https://github.com/pprb/tankobon/issues/181)) ([1bd833c](https://github.com/pprb/tankobon/commit/1bd833c19a03204cf2678fd8c0b5d2122a56eb20))
* **import:** refuse network paths in an imported library ([#178](https://github.com/pprb/tankobon/issues/178)) ([0575118](https://github.com/pprb/tankobon/commit/0575118cff089aff91369d5093631ce8e0072bb8))
* **library:** analyze the cleanup only once when the window opens ([#211](https://github.com/pprb/tankobon/issues/211)) ([9bed148](https://github.com/pprb/tankobon/commit/9bed14855c2afa9ebc8b53b61d9d37437dd218d3))
* **library:** share the run lock between every writer of the library files ([#179](https://github.com/pprb/tankobon/issues/179)) ([5833480](https://github.com/pprb/tankobon/commit/583348065c2d4cb3da13fce9fb178097e483c8d9))
* **library:** trash the same sidecars for remove and remove-many ([#186](https://github.com/pprb/tankobon/issues/186)) ([d53d7b5](https://github.com/pprb/tankobon/commit/d53d7b5d798eae45138716a74a193428ae0543ec))
* **metadata:** drop release dates that do not exist ([#185](https://github.com/pprb/tankobon/issues/185)) ([c06a746](https://github.com/pprb/tankobon/commit/c06a746954fb90654daf937cb54be4456af68252))
* **nfo:** parse .nfo files in linear time ([#177](https://github.com/pprb/tankobon/issues/177)) ([0b861be](https://github.com/pprb/tankobon/commit/0b861bef167affbb253d95e6d7e19527294399cf))
* **nfo:** replace the sidecar instead of writing through a symbolic link ([#184](https://github.com/pprb/tankobon/issues/184)) ([2f85174](https://github.com/pprb/tankobon/commit/2f851741ae9f966b0e551a11ef20c41b82158920))
* **paths:** keep root-relative paths inside their folder ([#183](https://github.com/pprb/tankobon/issues/183)) ([d0147fb](https://github.com/pprb/tankobon/commit/d0147fb5a8b3b26985c9da9be2b933b983873854))
* **reader:** leave keys to the focused control and to modifier shortcuts ([#180](https://github.com/pprb/tankobon/issues/180)) ([b3bfcc0](https://github.com/pprb/tankobon/commit/b3bfcc08af4298032536811d612eda009e5818ce))
* **reader:** readability of the zoom select in dark mode ([#204](https://github.com/pprb/tankobon/issues/204)) ([62af3fc](https://github.com/pprb/tankobon/commit/62af3fc480dad73209ab43647f6e611c2c9a50c7))
* **reader:** reopen a book the decoder lost, and retry a failed page ([#188](https://github.com/pprb/tankobon/issues/188)) ([959bb4e](https://github.com/pprb/tankobon/commit/959bb4e5bf7f96818d2219e2ef49568a3cfc6eb0))
* **users:** keep a long library run for the user who started it ([#187](https://github.com/pprb/tankobon/issues/187)) ([30c683f](https://github.com/pprb/tankobon/commit/30c683fb42cda5f999844b0eaead394954526ec1))


### Performance Improvements

* cheaper activeId and attrib checks, bounded settings and import file ([#190](https://github.com/pprb/tankobon/issues/190)) ([207ef76](https://github.com/pprb/tankobon/commit/207ef761c267aa829f0e76e4396a19ff75868942))

## [0.15.0](https://github.com/pprb/tankobon/compare/v0.14.0...v0.15.0) (2026-10-20)


### Features

* **home:** choose a single row or wrapping lines for each section ([#174](https://github.com/pprb/tankobon/issues/174)) ([7250142](https://github.com/pprb/tankobon/commit/725014239afbf53d2a07b2efdd2cac945e1cdadb))
* **home:** remove the explanatory text of the second chance block ([#173](https://github.com/pprb/tankobon/issues/173)) ([22c1b2e](https://github.com/pprb/tankobon/commit/22c1b2e19113c0b0b6fbe68c56646a04808ff529))
* **home:** suggest only the next unread volume of each series ([#175](https://github.com/pprb/tankobon/issues/175)) ([7713d28](https://github.com/pprb/tankobon/commit/7713d282a7a9f58610e8e286a2f263a982bce646))
* **library:** keep the search and filters when leaving the page ([#170](https://github.com/pprb/tankobon/issues/170)) ([43863ce](https://github.com/pprb/tankobon/commit/43863ce5c7a623ad8aea377e76244cb8046049d2))
* **library:** list the files a resynchronization could not open ([#171](https://github.com/pprb/tankobon/issues/171)) ([fab2824](https://github.com/pprb/tankobon/commit/fab2824c442e90608673b0669ffa343ed80a775d))
* **settings:** move the resynchronization to the shared library's organization page ([#172](https://github.com/pprb/tankobon/issues/172)) ([cd7e275](https://github.com/pprb/tankobon/commit/cd7e2753db88a0e6934ac59cf7af14066f4a1eb9))


### Bug Fixes

* **ci:** pin the Linux build runner to ubuntu-24.04 ([#168](https://github.com/pprb/tankobon/issues/168)) ([d0756d5](https://github.com/pprb/tankobon/commit/d0756d5bf45cffdeeddc253e498ffda7b42c0fff))

## [0.14.0](https://github.com/pprb/tankobon/compare/v0.13.0...v0.14.0) (2026-10-20)


### Features

* **library:** clean books of their non-image files ([#163](https://github.com/pprb/tankobon/issues/163)) ([0bcd36a](https://github.com/pprb/tankobon/commit/0bcd36a806e12fe3576ae971c71adf25e09e5098))
* **library:** keep the original file name when the book has no fiche ([#161](https://github.com/pprb/tankobon/issues/161)) ([d4f41ad](https://github.com/pprb/tankobon/commit/d4f41ad5901624a6dd3c167478dd25f130630542))
* **library:** move the duplicate search to the organization settings ([#164](https://github.com/pprb/tankobon/issues/164)) ([99a9e38](https://github.com/pprb/tankobon/commit/99a9e38fa6dab46dc3a225c8eb971542f9ec1364))
* **library:** remember kept duplicate groups and stop offering them again ([#165](https://github.com/pprb/tankobon/issues/165)) ([e8daad8](https://github.com/pprb/tankobon/commit/e8daad8be615e0c651581eb72fbff09e549cd0d1))
* **library:** show the synchronization state in the sidebar ([#160](https://github.com/pprb/tankobon/issues/160)) ([d54fcb3](https://github.com/pprb/tankobon/commit/d54fcb3d4fcce081f2a0235b3cb45faf1563b107))
* **organization:** add settings for cover and .nfo sidecars ([#162](https://github.com/pprb/tankobon/issues/162)) ([2d9dec5](https://github.com/pprb/tankobon/commit/2d9dec51d5368d401d7393a056995a288661a9a8))

## [0.13.0](https://github.com/pprb/tankobon/compare/v0.12.0...v0.13.0) (2026-10-19)


### Features

* **library:** extract missing covers during resynchronization ([#153](https://github.com/pprb/tankobon/issues/153)) ([8918236](https://github.com/pprb/tankobon/commit/891823666b4d15b5080942540fb7c6a01de60f93))
* **library:** find duplicate files of the same book and format and choose which to keep ([#154](https://github.com/pprb/tankobon/issues/154)) ([f6fe4e5](https://github.com/pprb/tankobon/commit/f6fe4e58a64dee49599793b8955d1cb591eba594))
* **library:** move the .nfo with its comic when organizing ([#152](https://github.com/pprb/tankobon/issues/152)) ([0e71c83](https://github.com/pprb/tankobon/commit/0e71c83d15d54d7b2a08a5bd916c66b9e3fcaf53))
* **library:** offer to trash the file when removing a book ([#155](https://github.com/pprb/tankobon/issues/155)) ([0c9c38d](https://github.com/pprb/tankobon/commit/0c9c38d1c09cc16cdee54dac43bd003da773a199))
* **metadata:** rework the lookup dialog with explicit search and page sources ([#156](https://github.com/pprb/tankobon/issues/156)) ([bbb87aa](https://github.com/pprb/tankobon/commit/bbb87aaf938650236cf9a0561b48191dffef520f))
* **settings:** split user settings from shared library settings ([#158](https://github.com/pprb/tankobon/issues/158)) ([195c20d](https://github.com/pprb/tankobon/commit/195c20dbf26ac25a8419a0a3f6f011817cc24362))


### Bug Fixes

* **settings:** make the startup user choice a per-user setting ([#159](https://github.com/pprb/tankobon/issues/159)) ([b439d31](https://github.com/pprb/tankobon/commit/b439d31d745a5bcf97490c5289b432b4c7af57c8))

## [0.12.0](https://github.com/pprb/tankobon/compare/v0.11.0...v0.12.0) (2026-10-19)


### Features

* **covers:** keep the cover beside the comic instead of the local cache ([#150](https://github.com/pprb/tankobon/issues/150)) ([67a7cf4](https://github.com/pprb/tankobon/commit/67a7cf4dbb2ec28a3b5daa8dd6e5f8f8514a6062))
* **library:** write the missing .nfo sidecars during resynchronization ([#149](https://github.com/pprb/tankobon/issues/149)) ([5f4c894](https://github.com/pprb/tankobon/commit/5f4c894a6dab3a7dfa0f9cf08090ca5b7a26014f))

## [0.11.0](https://github.com/pprb/tankobon/compare/v0.10.0...v0.11.0) (2026-10-19)


### Features

* **library:** read a .nfo file next to a comic when it is added ([#147](https://github.com/pprb/tankobon/issues/147)) ([e4e9e57](https://github.com/pprb/tankobon/commit/e4e9e574c99c2c4a8aae389590b1fd92bc79597e))
* **library:** skip cloud placeholders in background measure and covers ([#146](https://github.com/pprb/tankobon/issues/146)) ([cb9452d](https://github.com/pprb/tankobon/commit/cb9452d26da61eaa59ebac021d16d83617ecb894))

## [0.10.0](https://github.com/pprb/tankobon/compare/v0.9.1...v0.10.0) (2026-10-19)


### Features

* **app:** open a comic from the file explorer ([#143](https://github.com/pprb/tankobon/issues/143)) ([9fe506e](https://github.com/pprb/tankobon/commit/9fe506e2dd6b5194e7d286673c1d91a487500ae5))
* **library:** add a filter for books without a fiche ([#141](https://github.com/pprb/tankobon/issues/141)) ([6b329f4](https://github.com/pprb/tankobon/commit/6b329f49578e8c2d35a944507dad0ec69db494c7))
* **library:** add a grid display mode with covers side by side ([#142](https://github.com/pprb/tankobon/issues/142)) ([c506b86](https://github.com/pprb/tankobon/commit/c506b86c63f064ca714b7381aa0ebd915c3f9ce8))
* **library:** group a book that exists in several formats ([#144](https://github.com/pprb/tankobon/issues/144)) ([8dd4d09](https://github.com/pprb/tankobon/commit/8dd4d0946d9e6f3f84f05a0d7a9c61ee4a1117dd))

## [0.9.1](https://github.com/pprb/tankobon/compare/v0.9.0...v0.9.1) (2026-10-18)


### Bug Fixes

* **library:** store book paths relative to their library folder ([#139](https://github.com/pprb/tankobon/issues/139)) ([dee19f2](https://github.com/pprb/tankobon/commit/dee19f24a6b467625e7cefa99ccf329b6d32811c))

## [0.9.0](https://github.com/pprb/tankobon/compare/v0.8.1...v0.9.0) (2026-10-18)


### Features

* **profile:** show and clear the reading history ([#137](https://github.com/pprb/tankobon/issues/137)) ([e784873](https://github.com/pprb/tankobon/commit/e784873887c1f4fb7035caf734aae4ee2354c823))
* **settings:** add light/dark/system theme choice ([#131](https://github.com/pprb/tankobon/issues/131)) ([daf4f78](https://github.com/pprb/tankobon/commit/daf4f78d02066809f5d93f6b11826ca0aa1c0110))
* **users:** delete a user while another one remains ([#136](https://github.com/pprb/tankobon/issues/136)) ([4b0ef13](https://github.com/pprb/tankobon/commit/4b0ef13fa5dccb64e6300b920cbe83ba9687a05e))
* **users:** manage several users sharing one library ([#134](https://github.com/pprb/tankobon/issues/134)) ([8a9a4d8](https://github.com/pprb/tankobon/commit/8a9a4d80471e5c4d4599f639453064c42bd5d4b5))
* **users:** offer a user choice screen at startup ([#138](https://github.com/pprb/tankobon/issues/138)) ([dc68081](https://github.com/pprb/tankobon/commit/dc68081a1a8e2e35ea9608718d8bd37178a4c3a6))

## [0.8.1](https://github.com/pprb/tankobon/compare/v0.8.0...v0.8.1) (2026-10-18)


### Bug Fixes

* **reader:** keep the scroll position when a page above the viewport changes height ([#132](https://github.com/pprb/tankobon/issues/132)) ([0ad9a24](https://github.com/pprb/tankobon/commit/0ad9a24f17913a2bd2994caceba85975c92dd92a))

## [0.8.0](https://github.com/pprb/tankobon/compare/v0.7.0...v0.8.0) (2026-10-14)


### Features

* **decoder:** time out hung file opens, close a window's archives with it ([#129](https://github.com/pprb/tankobon/issues/129)) ([c04d1c4](https://github.com/pprb/tankobon/commit/c04d1c4d5e1c23217a5cc561bc75d8454ddd72d0))


### Bug Fixes

* **a11y:** drop the link role on book rows, label the tag field and the stars ([#126](https://github.com/pprb/tankobon/issues/126)) ([a57b83c](https://github.com/pprb/tankobon/commit/a57b83cd4aa9ce2630473506be8b5e4cd214d46b))
* **app:** allow a single instance and wait for the database lock ([#112](https://github.com/pprb/tankobon/issues/112)) ([923d5a0](https://github.com/pprb/tankobon/commit/923d5a0b93e235548ae6cd111bb43b69d5fd3428))
* **cbr:** refuse pages that unpack above the entry size limit ([#111](https://github.com/pprb/tankobon/issues/111)) ([d0628de](https://github.com/pprb/tankobon/commit/d0628de333befcf040d60e1d8b8852351ac074e8))
* **comic:** close the decoder archive when comic:open fails after opening it ([#110](https://github.com/pprb/tankobon/issues/110)) ([77ed34f](https://github.com/pprb/tankobon/commit/77ed34f099210eb21c28378252c8138ff6bc36b3))
* **data:** roll back optimistic writes that the main process refuses ([#115](https://github.com/pprb/tankobon/issues/115)) ([0ca40c7](https://github.com/pprb/tankobon/commit/0ca40c7d0715631aed1adb904d0364e27259beaf))
* **db:** make clear() and metadata updates atomic, tolerate bad settings rows ([#116](https://github.com/pprb/tankobon/issues/116)) ([92e2099](https://github.com/pprb/tankobon/commit/92e2099b6c561bef639ef7995a059a86762a0da7))
* **import:** only accept absolute paths of supported comics ([#117](https://github.com/pprb/tankobon/issues/117)) ([67f916c](https://github.com/pprb/tankobon/commit/67f916c31b191e7d914bf18c6e04d4a89f0c15fe))
* **library:** treat names starting with two dots as inside their folder ([#113](https://github.com/pprb/tankobon/issues/113)) ([530319a](https://github.com/pprb/tankobon/commit/530319a54b31ee3b51d43d959bee550a37fd8c67))
* **metadata:** cap response sizes and refuse redirects to another site ([#119](https://github.com/pprb/tankobon/issues/119)) ([3964b82](https://github.com/pprb/tankobon/commit/3964b826d7c207f5069f21609745c8aab1eff0e8))
* **reader:** flush the continuous reader's pending progress when it closes ([#114](https://github.com/pprb/tankobon/issues/114)) ([3593d47](https://github.com/pprb/tankobon/commit/3593d47edccc6f54e0eeb28d3ffcdf04be246920))
* **reader:** key the upscaler cache by page, not by blob URL ([#124](https://github.com/pprb/tankobon/issues/124)) ([edae8d7](https://github.com/pprb/tankobon/commit/edae8d737a5e64c0be26e83719fd77335b5ba1dc))
* **reader:** release continuous-mode pages that are far from the viewport ([#123](https://github.com/pprb/tankobon/issues/123)) ([523f56d](https://github.com/pprb/tankobon/commit/523f56d8c1eac3826a1a9e61bc8c5847bda10c5b))


### Performance Improvements

* **achievements:** stop recounting at every page turn ([#125](https://github.com/pprb/tankobon/issues/125)) ([897102b](https://github.com/pprb/tankobon/commit/897102b5f28864ad83cc8635b3bf7e03f9e452a3))


### Documentation

* update the dependency audit section ([#121](https://github.com/pprb/tankobon/issues/121)) ([bfedb20](https://github.com/pprb/tankobon/commit/bfedb20f41634cb4475ddbffca901af6e633e3c8))

## [0.7.0](https://github.com/pprb/tankobon/compare/v0.6.0...v0.7.0) (2026-10-12)


### Features

* **home:** add a continue reading block ([#102](https://github.com/pprb/tankobon/issues/102)) ([e588f18](https://github.com/pprb/tankobon/commit/e588f181936299fbce115952afac09a0adbc42e9))
* **home:** add an empty home page shown at start-up ([#101](https://github.com/pprb/tankobon/issues/101)) ([0230102](https://github.com/pprb/tankobon/commit/0230102c04b40a2336e5874c21428a10298b8753))
* **home:** choose the home page's sections and order in the settings ([#107](https://github.com/pprb/tankobon/issues/107)) ([3d34a00](https://github.com/pprb/tankobon/commit/3d34a0073f320a69b5dff0acaad9c418a9eb1bca))
* **home:** list the 5 most recently added books ([#103](https://github.com/pprb/tankobon/issues/103)) ([968304c](https://github.com/pprb/tankobon/commit/968304cbe1f1db4a2abf65b1ee18e0b32dfaf335))
* **home:** list the lowest-rated books to give them a second chance ([#108](https://github.com/pprb/tankobon/issues/108)) ([d848cb0](https://github.com/pprb/tankobon/commit/d848cb025493849aa4751b6e3494235f8a19b0e0))
* **home:** set how many books each section shows, with arrows and hide-when-empty ([#109](https://github.com/pprb/tankobon/issues/109)) ([772756f](https://github.com/pprb/tankobon/commit/772756fa64fe399516ca7c4b42f53a8520f7ae93))
* **home:** suggest five random unread books ([#104](https://github.com/pprb/tankobon/issues/104)) ([a28cf25](https://github.com/pprb/tankobon/commit/a28cf2552fcaa1d368feea038c25ec7410203b57))
* **home:** suggest the five best-rated books to rediscover ([#106](https://github.com/pprb/tankobon/issues/106)) ([db538f4](https://github.com/pprb/tankobon/commit/db538f46627245fe62f7beeb9e073c5f01507411))


### Bug Fixes

* **reader:** find the continuous scroll area by its role in the e2e tests ([#99](https://github.com/pprb/tankobon/issues/99)) ([c4a2e97](https://github.com/pprb/tankobon/commit/c4a2e979828d9f9521da42d3461e438f21b5a568))

## [0.6.0](https://github.com/pprb/tankobon/compare/v0.5.0...v0.6.0) (2026-10-11)


### Features

* **app:** check for a newer release at startup ([#84](https://github.com/pprb/tankobon/issues/84)) ([fef6c07](https://github.com/pprb/tankobon/commit/fef6c07fcfbffded62ff0c30ffbba1f52e6371a2))
* **app:** show a loader while the application starts ([#87](https://github.com/pprb/tankobon/issues/87)) ([f9ed33e](https://github.com/pprb/tankobon/commit/f9ed33ee051df3fb4f89cdc1a63b2480499437d9))
* **library:** choose the organized folder's tree ([#94](https://github.com/pprb/tankobon/issues/94)) ([f7e6b06](https://github.com/pprb/tankobon/commit/f7e6b064a51049f742b3ea9a5e7ba58f0ea6cd1c))
* **library:** group the library list by series ([#92](https://github.com/pprb/tankobon/issues/92)) ([636ee86](https://github.com/pprb/tankobon/commit/636ee865c25d751f9dca3e0922b4205d653fd0f9))
* **library:** move added comics into an organized folder ([#89](https://github.com/pprb/tankobon/issues/89)) ([025a2e1](https://github.com/pprb/tankobon/commit/025a2e1d34c328b828f1fdca30758382711d7c4d))
* **library:** rename organized files from a template of metadata fields ([#98](https://github.com/pprb/tankobon/issues/98)) ([37d7f35](https://github.com/pprb/tankobon/commit/37d7f352428cc94bc7ce5406a5e714b7a853b27b))
* **library:** sort the library by date added, release date or title ([#95](https://github.com/pprb/tankobon/issues/95)) ([2fe058a](https://github.com/pprb/tankobon/commit/2fe058ae9a161a9c1c2764474c82454c0d407855))
* **lists:** add a whole series or a selection of books to a reading list ([#93](https://github.com/pprb/tankobon/issues/93)) ([4d0f9b9](https://github.com/pprb/tankobon/commit/4d0f9b91583349754ca6d27be2b625bf5af7eec1))
* **lists:** offer the library's display modes on a reading list's page ([#97](https://github.com/pprb/tankobon/issues/97)) ([82e1bf9](https://github.com/pprb/tankobon/commit/82e1bf91dacee364dc7c3fcbc44c6f2270af75c4))
* **reader:** resize pages in continuous scroll mode ([#83](https://github.com/pprb/tankobon/issues/83)) ([695ba4d](https://github.com/pprb/tankobon/commit/695ba4d0dcd07ab6bd476229c74ed3046fc87e96))
* **settings:** add the MIT license file and a license section to About ([#96](https://github.com/pprb/tankobon/issues/96)) ([ac5b48a](https://github.com/pprb/tankobon/commit/ac5b48adea36b91a5fdbd00311c49665d7da2507))


### Bug Fixes

* **library:** align the rating filter and view picker heights with the search field ([#91](https://github.com/pprb/tankobon/issues/91)) ([5531336](https://github.com/pprb/tankobon/commit/55313362d455518aa8e09ae82ba4a837c4253bd7))


### Performance Improvements

* **reader:** cache and prefetch rendered PDF pages ([#85](https://github.com/pprb/tankobon/issues/85)) ([3abea33](https://github.com/pprb/tankobon/commit/3abea33ebb9931426325283b44f5be1db25234f9))

## [0.5.0](https://github.com/pprb/tankobon/compare/v0.4.0...v0.5.0) (2026-10-06)


### Features

* **achievements:** add achievements with manga-style badges and unlock toasts ([#81](https://github.com/pprb/tankobon/issues/81)) ([3ac6ca1](https://github.com/pprb/tankobon/commit/3ac6ca11cd4b60cb617b0502892b70f455fa7b36))
* **app:** add the application icon ([#79](https://github.com/pprb/tankobon/issues/79)) ([92e5b74](https://github.com/pprb/tankobon/commit/92e5b747cc0986ad21ac1576f825067d318109e9))
* **app:** replace the default menu bar with a minimal translated one ([#80](https://github.com/pprb/tankobon/issues/80)) ([87fff94](https://github.com/pprb/tankobon/commit/87fff94e03278c3fa194d2d853db9002289e5681))
* **i18n:** show country flags in language pickers and book languages ([#82](https://github.com/pprb/tankobon/issues/82)) ([89fa8cf](https://github.com/pprb/tankobon/commit/89fa8cf319e6fdb8f31104587346560ccc566b7c))
* **library:** add full, medium and compact display modes ([#74](https://github.com/pprb/tankobon/issues/74)) ([be4ef08](https://github.com/pprb/tankobon/commit/be4ef0881268becad7c48b83d612b7c0b0920c92))
* **library:** measure average page size in the background ([#75](https://github.com/pprb/tankobon/issues/75)) ([84f382c](https://github.com/pprb/tankobon/commit/84f382c6ce0c0ac3669666b16f3b4362e39938e3))
* **library:** resync also checks files added individually ([#73](https://github.com/pprb/tankobon/issues/73)) ([0b8ee57](https://github.com/pprb/tankobon/commit/0b8ee5792ddab2b2fb28d4e2742136f62f9e395b))
* **reader:** offer to remove a library book that fails to open ([#72](https://github.com/pprb/tankobon/issues/72)) ([b5d2bbe](https://github.com/pprb/tankobon/commit/b5d2bbe5bd0ec91ca5c20becd7f00b34c308c5dd))
* **stats:** add a reading statistics page ([#77](https://github.com/pprb/tankobon/issues/77)) ([bfa718f](https://github.com/pprb/tankobon/commit/bfa718f1a615b59e3e6268b65c64d73460eace02))


### Bug Fixes

* **reader:** start a zoomed page at its top or bottom edge after a page turn ([#76](https://github.com/pprb/tankobon/issues/76)) ([692ba36](https://github.com/pprb/tankobon/commit/692ba36005ccd6b83c009653d829e077726c8493))

## [0.4.0](https://github.com/pprb/tankobon/compare/v0.3.0...v0.4.0) (2026-10-04)


### Features

* **db:** versioned schema migrations with PRAGMA user_version ([#54](https://github.com/pprb/tankobon/issues/54)) ([086f981](https://github.com/pprb/tankobon/commit/086f981cd4d5b4b0f1cc767c73cf848a85a365b8))
* **decoder:** decode comic files in a utility process ([#56](https://github.com/pprb/tankobon/issues/56)) ([640d119](https://github.com/pprb/tankobon/commit/640d1196a001cfffce1354cc1d81248f6df60693))
* **ipc:** validate renderer arguments and stop taking paths from it ([#53](https://github.com/pprb/tankobon/issues/53)) ([9a77747](https://github.com/pprb/tankobon/commit/9a777470e07412782b9b9e3f775bcbb4c591e161))
* **library:** add a drag handle to library rows ([#66](https://github.com/pprb/tankobon/issues/66)) ([caaba2a](https://github.com/pprb/tankobon/commit/caaba2a0b9a41c7d9989f01bafc30c89bb6ea73e))
* **library:** confirm before removing a book ([#46](https://github.com/pprb/tankobon/issues/46)) ([82fada0](https://github.com/pprb/tankobon/commit/82fada068d3bd22f6600659f556b89ad6443b6f2))
* **library:** let the user close the scan progress bar ([#63](https://github.com/pprb/tankobon/issues/63)) ([3a4ccaf](https://github.com/pprb/tankobon/commit/3a4ccafbd69e5a4c7786321fb07c0075e13f4487))
* **library:** open the add-folder dialog in the previously scanned directory ([#62](https://github.com/pprb/tankobon/issues/62)) ([fe0dc55](https://github.com/pprb/tankobon/commit/fe0dc551bdef71e520d85d68bc8139242b771c23))
* **library:** resynchronize the library with its folders ([#67](https://github.com/pprb/tankobon/issues/67)) ([72ca859](https://github.com/pprb/tankobon/commit/72ca8597e5477b0c18b993958f3b64fe513c30dc))
* **library:** show the file format (CBZ, CBR, PDF) in the library ([#65](https://github.com/pprb/tankobon/issues/65)) ([79e346c](https://github.com/pprb/tankobon/commit/79e346cf6f925f9286e1d23704ee7003d4eef047))
* **reader:** option to add opened books to the library, anonymous reading otherwise ([#64](https://github.com/pprb/tankobon/issues/64)) ([6fb93bd](https://github.com/pprb/tankobon/commit/6fb93bd3aa1c15541af114cf4decca1d2d18ee64))
* **renderer:** single data store fed by a data:changed push, virtualized library ([#59](https://github.com/pprb/tankobon/issues/59)) ([6717519](https://github.com/pprb/tankobon/commit/6717519e3c771fb226e4b46f94995d4ce1f56302))
* **ui:** confirm destructive actions in an in-app dialog ([#71](https://github.com/pprb/tankobon/issues/71)) ([1178b45](https://github.com/pprb/tankobon/commit/1178b45da4ccf8fd1a5ac2ff2d7bdd8d05854cb2))


### Bug Fixes

* **archive:** refuse images with huge dimensions before decoding them ([#55](https://github.com/pprb/tankobon/issues/55)) ([27682c5](https://github.com/pprb/tankobon/commit/27682c531d491fe474d17fe6cd972102af3b79e2))
* **data:** report export and clear failures to the user ([#43](https://github.com/pprb/tankobon/issues/43)) ([145fed1](https://github.com/pprb/tankobon/commit/145fed1111376ab428a572e44b12d5b40d7a791e))
* **db:** run the JSON import and multi-statement writes in transactions ([#39](https://github.com/pprb/tankobon/issues/39)) ([5845aa6](https://github.com/pprb/tankobon/commit/5845aa6c78193a0b3a0d2ce375722b0e194ac3c9))
* **ipc:** validate renderer arguments in the main process ([#49](https://github.com/pprb/tankobon/issues/49)) ([da2d9c3](https://github.com/pprb/tankobon/commit/da2d9c39376d459484f56bcd88fc35101ab0a4ad))
* **library:** add a single file to the library without opening the reader ([#69](https://github.com/pprb/tankobon/issues/69)) ([21dba9b](https://github.com/pprb/tankobon/commit/21dba9b6a29bb20c8e6cbfed68fe17c9b343b90d))
* **lists:** reset the reading list page when switching lists ([#38](https://github.com/pprb/tankobon/issues/38)) ([62350b3](https://github.com/pprb/tankobon/commit/62350b3f635a050eb81551b5a126e183da4b9ab6))
* **pdf:** cap the rendered page size ([#40](https://github.com/pprb/tankobon/issues/40)) ([624a5bc](https://github.com/pprb/tankobon/commit/624a5bcfb9fb8050c2661a5711f8709f0a7ec373))
* **pdf:** make pdf.js run its Node code paths in the decoder process ([#70](https://github.com/pprb/tankobon/issues/70)) ([04c145f](https://github.com/pprb/tankobon/commit/04c145f8ff80d17050cb5971bee2a27b428a43bf))
* **reader:** close an archive opened after the reader left or switched books ([#42](https://github.com/pprb/tankobon/issues/42)) ([a8138a0](https://github.com/pprb/tankobon/commit/a8138a059a2215d384f096bb6bff7d8caf2fd384))
* **reader:** keep the UI responsive during AI upscaling ([#60](https://github.com/pprb/tankobon/issues/60)) ([9f8b37e](https://github.com/pprb/tankobon/commit/9f8b37e2367f44dde468413a4476af5a448b3413))
* **reader:** keep the zoomed page centered when smaller than the viewport ([#61](https://github.com/pprb/tankobon/issues/61)) ([bfa8342](https://github.com/pprb/tankobon/commit/bfa8342adfbc9e9f75622f1e792be8b0da1aca26))
* **reader:** show a French message when a book cannot be opened ([#44](https://github.com/pprb/tankobon/issues/44)) ([3eb0455](https://github.com/pprb/tankobon/commit/3eb0455c3c4dfbdbbef2ea188983ec0fc4d253f3))
* **reader:** track the active page in continuous mode whatever its height ([#36](https://github.com/pprb/tankobon/issues/36)) ([ba75a66](https://github.com/pprb/tankobon/commit/ba75a660d947e0c9f51c5dda1f80bb3da84c4706))
* **security:** block navigation, new windows and file drops on the main window ([#37](https://github.com/pprb/tankobon/issues/37)) ([7c49795](https://github.com/pprb/tankobon/commit/7c4979559f547b514cf956c25fae3a7fc361ce46))
* **settings:** reload every settings view after an import ([#48](https://github.com/pprb/tankobon/issues/48)) ([7ff21cd](https://github.com/pprb/tankobon/commit/7ff21cd617818f185e0ba7097b2c91b7c9e94870))
* **thumbnails:** queue thumbnail removal behind a running generation ([#57](https://github.com/pprb/tankobon/issues/57)) ([eddd15e](https://github.com/pprb/tankobon/commit/eddd15eab078ac5f7c639710330d6123c7bba209))

## [0.3.0](https://github.com/pprb/tankobon/compare/v0.2.1...v0.3.0) (2026-10-02)


### Features

* **data:** add a button to clear the library ([#25](https://github.com/pprb/tankobon/issues/25)) ([8f59797](https://github.com/pprb/tankobon/commit/8f5979714b7df104d7ba87f740f7c35dadd316a4))
* **data:** add the time to the export's default file name ([#28](https://github.com/pprb/tankobon/issues/28)) ([fe6a855](https://github.com/pprb/tankobon/commit/fe6a85563d3c574c7cebec92a0b8c7b66ddb57ee))
* **i18n:** translate the interface into English and French ([#35](https://github.com/pprb/tankobon/issues/35)) ([785fd5a](https://github.com/pprb/tankobon/commit/785fd5a0957ec279f9f4721e09431a976882d85f))
* **library:** edit a book's information by hand ([#26](https://github.com/pprb/tankobon/issues/26)) ([a38f74f](https://github.com/pprb/tankobon/commit/a38f74f3322d6b807974ef016027d7d64a8d3a55))
* **library:** show cover thumbnails for books ([#22](https://github.com/pprb/tankobon/issues/22)) ([65c8bab](https://github.com/pprb/tankobon/commit/65c8bab9de0d2a905dabf3844e00700ee86645ab))
* **lists:** add a book to a reading list by dragging it from the library ([#29](https://github.com/pprb/tankobon/issues/29)) ([ed2e481](https://github.com/pprb/tankobon/commit/ed2e4819cbfa619b96c825ccaaabc010a9e6147b))
* **lists:** add reading lists ([#21](https://github.com/pprb/tankobon/issues/21)) ([301cf1a](https://github.com/pprb/tankobon/commit/301cf1ac193ac4fdca3744cf658ea5b366222342))
* **lists:** reorder reading lists by drag and drop in the sidebar ([#27](https://github.com/pprb/tankobon/issues/27)) ([a1ba051](https://github.com/pprb/tankobon/commit/a1ba05178a31bed3b0f4fcff82a118ecaa32822a))
* **lists:** show reading lists in the sidebar ([#24](https://github.com/pprb/tankobon/issues/24)) ([03c047f](https://github.com/pprb/tankobon/commit/03c047f1a4812a35f4752dd2bddf6af78f587e8a))
* **settings:** add an "À propos" section with versions and project links ([#30](https://github.com/pprb/tankobon/issues/30)) ([906b4ac](https://github.com/pprb/tankobon/commit/906b4aca6106de17b269c2c8b70feb48339964de))
* **ui:** show the hand cursor on clickable controls ([#31](https://github.com/pprb/tankobon/issues/31)) ([1040202](https://github.com/pprb/tankobon/commit/1040202cfbad81f5e061c188cfb92ac15ed97c09))


### Bug Fixes

* **library:** use the move pointer when dragging a book onto a reading list ([#33](https://github.com/pprb/tankobon/issues/33)) ([8f90025](https://github.com/pprb/tankobon/commit/8f90025419c8f7ca0022f10118364465a615c4b7))

## [0.2.1](https://github.com/pprb/tankobon/compare/v0.2.0...v0.2.1) (2026-10-01)


### Bug Fixes

* **build:** name the Linux executable after the package name ([#19](https://github.com/pprb/tankobon/issues/19)) ([61e5274](https://github.com/pprb/tankobon/commit/61e5274084ea709c47a3cfa97246c8c24cddbfba))

## [0.2.0](https://github.com/pprb/tankobon/compare/v0.1.1...v0.2.0) (2026-10-01)


### Features

* **library:** look up book metadata in Comic Vine and Google Books ([#15](https://github.com/pprb/tankobon/issues/15)) ([2ca3afb](https://github.com/pprb/tankobon/commit/2ca3afbbda0908e115004d7ac9004c0c2f851431))
* **library:** read book metadata from a pasted Bédéthèque album link ([#18](https://github.com/pprb/tankobon/issues/18)) ([186a380](https://github.com/pprb/tankobon/commit/186a380ba75e3d6a9a6bb1e78f3f43eb4eca7e17))


### Bug Fixes

* force LF line endings in every file ([#14](https://github.com/pprb/tankobon/issues/14)) ([dd773ba](https://github.com/pprb/tankobon/commit/dd773ba4ce2898954ed13093874679c20f18167b))


### Documentation

* **adr:** confirm rationale and alternatives of ADRs 0001, 0002 and 0004 ([#12](https://github.com/pprb/tankobon/issues/12)) ([47ea932](https://github.com/pprb/tankobon/commit/47ea9327523be1ddbfc7c9f2cb2a41290fd61326))
* **preload:** declare window.tankobon as documented interfaces ([#11](https://github.com/pprb/tankobon/issues/11)) ([0a15739](https://github.com/pprb/tankobon/commit/0a15739f9a278903204d4046fb41e557368ff60c))

## [0.1.1](https://github.com/pprb/tankobon/compare/v0.1.0...v0.1.1) (2026-09-30)


### Bug Fixes

* **cbr:** keep reading a CBR after another one was opened ([#9](https://github.com/pprb/tankobon/issues/9)) ([a0cb56d](https://github.com/pprb/tankobon/commit/a0cb56d33c1641c90b407560973c3e15abf2b8e3))
* **deps:** update dependencies and clear the npm audit findings ([#10](https://github.com/pprb/tankobon/issues/10)) ([a58cab5](https://github.com/pprb/tankobon/commit/a58cab5797ef1e6416e5250a0d88ac6edf2f086b))


### Documentation

* set up maintainable documentation ([#2](https://github.com/pprb/tankobon/issues/2)) ([f3d5d64](https://github.com/pprb/tankobon/commit/f3d5d640196abb089d92cc91a0c89319a70ed32a))

## 0.1.0

Initial version, released before the adoption of Conventional Commits (history up to `5db3ea8`): its changes are not listed.
