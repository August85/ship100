import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

class Ship100App extends Application.AppBase {

    function initialize() {
        AppBase.initialize();
    }

    function getInitialView() {
        return [new Ship100View()];
    }
}
