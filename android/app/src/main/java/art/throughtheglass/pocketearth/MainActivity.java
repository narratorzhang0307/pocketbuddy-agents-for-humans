package art.throughtheglass.pocketearth;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PocketMnnPlugin.class);
        registerPlugin(PhotoLocationPlugin.class);
        registerPlugin(PhotoAssetRouterPlugin.class);
        registerPlugin(PhotoLibraryPlugin.class);
        registerPlugin(PhotoSemanticPlugin.class);
        registerPlugin(FrostBadgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
