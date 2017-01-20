/**
 * @file 模块
 * @author xuld <xuld@vip.qq.com>
 */
import * as path from "path";
import * as digo from "digo";
import { Packer, getMimeType } from "./packer";

/**
 * 表示一个模块。
 */
export abstract class Module {

    // #region 创建

    /**
     * 获取当前模块的所属打包器。
     */
    readonly packer: Packer;

    /**
     * 获取当前模块的源文件。
     */
    readonly file: digo.File;

    /**
     * 获取当前模块的选项。
     */
    readonly options: ModuleOptions;

    /**
     * 获取当前模块的源文件。
     */
    readonly srcPath?: string;

    /**
     * 获取当前模块的保存路径。
     */
    readonly destPath?: string;

    /**
     * 初始化一个新的模块。
     * @param packer 当前模块所属的打包器。
     * @param file 当前模块的源文件。
     * @param options 当前模块的选项。
     */
    constructor(packer: Packer, file: digo.File, options?: ModuleOptions) {
        this.packer = packer;
        this.file = file;
        this.options = options || emptyObject!;
        this.srcPath = file.srcPath;
        this.destPath = file.destPath;
        if (this.options.imports) {
            for (const path of this.options.imports) {
                this.require(this.resolvePathInConfig(path), module => {
                    if (module) {
                        this.import(module);
                    }
                })
            }
        }
        if (this.options.excludes) {
            for (const path of this.options.excludes) {
                this.require(this.resolvePathInConfig(path), module => {
                    if (module) {
                        this.exclude(module);
                    }
                })
            }
        }
    }

    /**
     * 解析配置中指定的路径。
     * @param base 要解析的基路径。
     * @param p 要解析的路径。
     * @return 返回已解析的路径。
     */
    protected resolvePathInConfig(base: string, p?: string) {
        return base.charCodeAt(0) === 46/*.*/ ? path.resolve(this.srcPath || "", base, p || "") : path.resolve(base, p || "");
    }

    // #endregion

    // #region 解析

    /**
     * 存储当前模块的所有依赖项。
     */
    private requires: [string | undefined, (module: Module | null) => void][] = [];

    /**
     * 存储当前模块是否已解析。
     */
    private resolved = false;

    /**
     * 指示当前模块依赖了指定路径。
     * @param path 依赖的绝对路径。
     * @param callback 模块已解析的回调函数。
     */
    protected require(path: string | undefined, callback: (module: Module | null) => void) {
        console.assert(!this.resolved);
        this.requires.push([path, callback]);
    }

    /**
     * 确保当前模块依赖的模块已全部加载。
     */
    ensure() {
        console.assert(!this.resolved);
        for (const req of this.requires) {
            if (req[0]) {
                this.packer.ensureFile(req[0]!);
            }
        }
    }

    /**
     * 确保当前模块及依赖都已解析。
     */
    resolve() {

        // 确保不重复解析。
        if (this.resolved) {
            return;
        }
        this.resolved = true;

        // 解析所有依赖项。
        for (const req of this.requires) {
            if (req[0]) {
                const module = this.packer.getModuleFromPath(req[0]!);
                module.resolve();
                req[1](module);
            } else {
                req[1](null);
            }
        }

        // 当前模块已解析，删除只在解析时需要的引用以释放内存。
        delete this.requires;
        delete (this as any).file;
    }

    // #endregion

    // #region 生成

    /**
     * 当被子类重写时负责将当前模块生成的内容保存到指定的文件。
     * @param file 要保存的目标文件。
     * @param result 要保存的目标列表。
     */
    abstract save(saveFile: digo.File, result?: digo.FileList);

    /**
     * 当被子类重写时负责获取当前模块的最终二进制内容。
     * @param savePath 要保存的目标路径。
     * @return 返回文件缓存。
     */
    abstract getBuffer(savePath: string);

    /**
     * 当被子类重写时负责获取当前模块的最终文本内容。
     * @param savePath 要保存的目标路径。
     * @return 返回文件内容。
     */
    getContent(savePath: string) {
        return this.getBase64Uri(this);
    }

    /**
     * 当被子类重写时负责获取当前模块的最终保存大小。
     * @param savePath 要保存的目标路径。
     */
    getSize(savePath: string) { return this.getBuffer(savePath).length; }

    /**
     * 获取指定模块的 data URI 地址。
     * @param module 要获取的模块。
     * @return 返回编码后的字符串。
     */
    protected getBase64Uri(module: Module) {
        return digo.base64Uri(this.getMimeType(digo.getExt(module.destPath || "")), module.getBuffer(module.destPath || ""));
    }

    /**
     * 获取指定扩展名的 MIME 类型。
     * @param ext 要获取的扩展名。
     * @return 返回 MIME 类型。
     */
    protected getMimeType(ext: string) {
        return this.options.mimeTypes && this.options.mimeTypes[ext] || getMimeType(ext);
    }

    // #endregion

    // #region 依赖公共

    /**
     * 获取当前模块直接包含的所有模块。
     */
    protected includes: Module[] = [];

    /**
     * 获取当前模块直接导入的所有模块。
     */
    protected imports: Module[] = [];

    /**
     * 获取当前模块直接排除的所有模块。
     */
    protected excludes: Module[] = [];

    /**
     * 判断当前模块及子模块是否已包含了目标模块。
     * @param module 要包含的模块。
     * @return 如果已包含则返回 true，否则返回 false。
     */
    protected hasInclude(module: Module) {
        if (module == this) {
            return true;
        }
        for (const include of this.includes) {
            if (include.hasInclude(module)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 包含一个模块。
     * @param module 要包含的模块。
     * @return 如果已成功包含则返回 true，否则表示存在循环包含，返回 false。
     */
    protected include(module: Module) {
        if (module.hasInclude(this)) {
            return false;
        }
        this.includes.push(module);
        if (module.srcPath) {
            this.file.dep(module.srcPath, {
                source: "WebPack:include"
            });
        }
        return true;
    }

    /**
     * 导入一个模块。
     * @param module 要导入的模块。
     */
    protected import(module: Module) {
        if (module == this) {
            return;
        }
        this.imports.push(module);
        if (module.srcPath) {
            this.file.dep(module.srcPath, {
                source: "WebPack:import"
            });
        }
    }

    /**
     * 排除一个模块。
     * @param module 要导入的模块。
     */
    protected exclude(module: Module) {
        if (module == this) {
            return;
        }
        this.excludes.push(module);
        if (module.srcPath) {
            this.file.dep(module.srcPath, {
                source: "WebPack:exclude"
            });
        }
    }

    /**
     * 将当前模块的导入项添加到目标数组。
     * @param result 要添加的目标数组。
     * @param processed 所有已处理的模块。
     */
    private addImportsTo(result: Module[], processed: Module[]) {
        if (processed.indexOf(this) >= 0) {
            return;
        }
        processed.push(this);
        for (const module of this.imports) {
            module.addImportsTo(result, processed);
        }
        result.push(this);
    }

    /**
     * 将当前模块的排除项添加到目标数组。
     * @param result 要添加的目标数组。
     * @param processed 所有已处理的模块。
     */
    private addExcludesTo(result: Module[], processed: Module[]) {
        if (processed.indexOf(this) >= 0) {
            return;
        }
        processed.push(this);
        for (const module of this.excludes) {
            module.addImportsTo(result, processed);
            module.addExcludesTo(result, processed);
        }
    }

    /**
     * 获取最终的文件依赖列表。
     * @return 返回模块列表。列表的顺序表示模块的依赖顺序。
     */
    protected getModuleList() {
        const imports: Module[] = [];
        const excludes: Module[] = [];
        this.addImportsTo(imports, []);
        this.addExcludesTo(excludes, [this]);
        if (excludes.length) {
            return imports.filter(module => excludes.indexOf(module) < 0);
        }
        return imports;
    }

    // #endregion

}

export default Module;

/**
 * 表示模块解析的选项。
 */
export interface ModuleOptions {

    /**
     * 手动设置导入项。
     */
    imports?: string[];

    /**
     * 手动设置排除项。
     */
    excludes?: string[];

    /**
     * 设置每个扩展名对应的 MIME 类型。
     */
    mimeTypes?: { [key: string]: string; };

}

/**
 * 获取一个空对象。
 */
export const emptyObject = Object.freeze({}) as any as undefined;
