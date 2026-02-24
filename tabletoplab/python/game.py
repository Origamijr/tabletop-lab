from lupa import LuaRuntime
import csv
import json
import glob
import os

class TTLGame():
    def __init__(self, path):
        self.path = path
        self.lua = LuaRuntime(unpack_returned_tuples=True)

        # Recursively find all CSV files and load them into COLLECTIONS (Lua global)
        collections = {}
        for csv_file in glob.glob(f"{path}/**/*.csv", recursive=True):
            rel_path = os.path.relpath(csv_file, path).replace("\\", "/")
            key = os.path.splitext(rel_path)[0]
            print(csv_file)
            collections[key] = self.parse_csv_sanitized(csv_file)
        self.lua.globals().COLLECTIONS = collections

        # Load game.json from the given path
        game_json_path = os.path.join(path, 'game.json')
        self.game_config = {}
        if os.path.isfile(game_json_path):
            with open(game_json_path, 'r') as f:
                self.game_config = json.load(f)
        else:
            raise(Exception())

        # Set up package.path to include both the game path and the core engine lua directory
        game_path_abs = os.path.abspath(path).replace("\\", "/")
        core_lua_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'lua')).replace("\\", "/")
        pkg_patterns = f";{game_path_abs}/?.lua;{game_path_abs}/?/init.lua;{core_lua_dir}/?.lua;{core_lua_dir}/?/init.lua"
        self.lua.execute(f'package.path = (package.path or "") .. "{pkg_patterns}"')

        # Require all core lua files from the engine's lua directory
        for lua_file in glob.glob(f"{core_lua_dir}/**/*.lua", recursive=True):
            rel = os.path.relpath(lua_file, core_lua_dir).replace("\\", "/")
            # Skip init.lua files (they're auto-loaded as module init)
            if rel.endswith('init.lua'):
                continue
            mod_name = os.path.splitext(rel)[0].replace('/', '.')
            try:
                self.lua.execute(f'pcall(require, "{mod_name}")')
            except Exception:
                pass

        # Require all lua scripts in the game path, except those in dynamic_scripts directories
        for lua_file in glob.glob(f"{game_path_abs}/**/*.lua", recursive=True):
            # Skip files in dynamic_scripts directories
            if '/object_scripts/' in lua_file.replace("\\", "/") or lua_file.replace("\\", "/").endswith('/dynamic_scripts.lua'):
                continue
            rel = os.path.relpath(lua_file, game_path_abs).replace("\\", "/")
            mod_name = os.path.splitext(rel)[0].replace('/', '.')
            try:
                self.lua.execute(f'pcall(require, "{mod_name}")')
            except Exception:
                pass

        # Expose a function to lua that loads lazy scripts from the lazy directory
        # Use a cache to avoid redundant file reads for the same script
        self.lazy_script_cache = {}
        def load_object_script(script_path):
            """Load a lazy script from the lazy directory. Path should not include .lua extension."""
            if script_path in self.lazy_script_cache:
                return self.lazy_script_cache[script_path]
            
            full_path = os.path.join(game_path_abs, 'object_scripts', script_path + '.lua')
            try:
                with open(full_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    self.lazy_script_cache[script_path] = content
                    return content
            except (IOError, OSError) as e:
                raise Exception(f"Failed to load object script '{script_path}': {e}")
        self.lua.globals().LOAD_OBJECT_SCRIPT = load_object_script
        
        self.logs = []
        def log(log_event):
            self.logs.append(log_event)
        self.lua.globals().LOG = log

        # Initialize a Gamestate object with self.game_config as the parameter
        self.lua.globals().Gamestate = self.lua.globals()['require']('tabletoplab.lua.Gamestate')
        self.gamestate = self.lua.globals().Gamestate(self.game_config)
        #self.lua.globals().GAMESTATE = self.gamestate

    def initialize(self):
        self.env = self.lua.eval

    def parse_csv_sanitized(self, path):
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            reader.fieldnames = [header.strip() for header in reader.fieldnames]
            def parse_cell(v):
                if v is None or v.strip() == "": return None
                try:
                    return json.loads(v.strip())
                except (json.JSONDecodeError, TypeError):
                    return v.strip()
            return [{k.strip(): parse_cell(v) for k, v in row.items()} for row in reader]

